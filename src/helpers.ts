import { GitHub } from '@actions/github/lib/utils.js'
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types.js'
import { minimatch } from 'minimatch'
import * as core from '@actions/core'
import {systemPrompt,instructionsPrompt,extensionToLanguageMap} from './constants.js'
import { Effect, Context, Option, Layer, Schedule } from 'effect'
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from 'langchain/prompts'
import {LLMChain} from 'langchain/chains'
import { BaseChatModel } from 'langchain/chat_models'
import type { ChainValues } from 'langchain/schema'
import parseDiff from 'parse-diff'
import { NoSuchElementException, UnknownException } from 'effect/Cause'
import { constant } from 'effect/Function'

export type PullRequestFileResponse = RestEndpointMethodTypes['pulls']['listFiles']['response']

export type PullRequestFile = ArrElement<PullRequestFileResponse['data']>
type CreateReviewCommentRequest = RestEndpointMethodTypes['pulls']['createReviewComment']['parameters']

type CreateReviewRequest = RestEndpointMethodTypes['pulls']['createReview']['parameters']

export interface PullRequest {
  getFilesForReview: (
    owner: string,
    repo: string,
    pullNumber: number,
    excludeFilePatterns: string[]
  ) => Effect.Effect<PullRequestFile[], UnknownException, InstanceType<typeof GitHub>>
  createReviewComment: (
    requestOptions: CreateReviewCommentRequest
  ) => Effect.Effect<void, unknown, InstanceType<typeof GitHub>>
  
  // createConsolidatedReviewComment: (
  //   requestOptions: CreateConsolidatedReviewCommentRequest
  // ) => Effect.Effect<void, unknown, InstanceType<typeof GitHub>>
  // createReview: (requestOptions: CreateReviewRequest) => Effect.Effect<void, unknown, InstanceType<typeof GitHub>>
}

export const octokitTag = Context.GenericTag<InstanceType<typeof GitHub>>('octokit')

export const PullRequest = Context.GenericTag<PullRequest>('PullRequest')
export class PullRequestClass implements PullRequest {
  getFilesForReview = (
    owner: string,
    repo: string,
    pullNumber: number,
    excludeFilePatterns: string[]
  ): Effect.Effect<PullRequestFile[], UnknownException, InstanceType<typeof GitHub>> => {
    const program = octokitTag.pipe(
      Effect.flatMap(octokit =>
        Effect.retry(
          Effect.tryPromise(() =>
            octokit.rest.pulls.listFiles({ owner, repo, pull_number: pullNumber, per_page: 100 })
          ),
          exponentialBackoffWithJitter(3)
        )
      ),
      Effect.tap(pullRequestFiles =>
        Effect.sync(() =>
          core.info(
            `Original files for review ${pullRequestFiles.data.length}: ${pullRequestFiles.data.map(_ => _.filename)}`
          )
        )
      ),
      Effect.flatMap(pullRequestFiles =>
        Effect.sync(() =>
          pullRequestFiles.data.filter(file => {
            return (
              excludeFilePatterns.every(pattern => !minimatch(file.filename, pattern, { matchBase: true })) &&
              (file.status === 'modified' || file.status === 'added' || file.status === 'changed')
            )
          })
        )
      ),
      Effect.tap(filteredFiles =>
        Effect.sync(() =>
          core.info(`Filtered files for review ${filteredFiles.length}: ${filteredFiles.map(_ => _.filename)}`)
        )
      )
    )

    return program
  }

  createReviewComment = (
    requestOptions: CreateReviewCommentRequest
  ): Effect.Effect<void, Error, InstanceType<typeof GitHub>> =>
    octokitTag.pipe(
      Effect.tap(_ => core.info(`Creating review comment: ${JSON.stringify(requestOptions)}`)),
      Effect.flatMap(octokit =>
        Effect.retry(
          Effect.tryPromise(() => octokit.rest.pulls.createReviewComment(requestOptions)),
          exponentialBackoffWithJitter(10)
        )
      )
    )
  
    // createConsolidatedReviewComment = (
    //   requestOptions: CreateConsolidatedReviewCommentRequest
    // ): Effect.Effect<void, Error, InstanceType<typeof GitHub>> =>
      // octokitTag.pipe(
      //   Effect.tap(_ => core.debug(`Creating consolidated review comment: ${JSON.stringify(requestOptions)}`)),
      //   Effect.flatMap(octokit =>
      //     Effect.retry(
      //       Effect.tryPromise(() =>
      //         octokit.rest.pulls.createReview({
      //           owner: requestOptions.owner,
      //           repo: requestOptions.repo,
      //           commit_id: requestOptions.file.sha,
      //           pull_number: requestOptions.pull_number,
      //           body: requestOptions.comments.join('\n'),
      //           event: 'COMMENT',
      //         })
      //       ),
      //       exponentialBackoffWithJitter(3)
      //     )
      //   )
      // )

  // createReview = (requestOptions: CreateReviewRequest): Effect.Effect<void, Error, InstanceType<typeof GitHub>> =>
  //   octokitTag.pipe(
  //     Effect.flatMap(octokit =>
  //       Effect.retry(
  //         Effect.tryPromise(() => octokit.rest.pulls.createReview(requestOptions)),
  //         exponentialBackoffWithJitter(3)
  //       )
  //     )
  //  )
}



const LanguageDetection = Effect.sync(() => {
  return {
    detectLanguage: (filename: string): Option.Option<Language> => {
      const extension = getFileExtension(filename)
      return Option.fromNullable(extensionToLanguageMap[extension as LanguageKey])
    }
  }
})

export class DetectLanguage extends Context.Tag('DetectLanguage')<
  DetectLanguage,
  Effect.Effect.Success<typeof LanguageDetection>
>() {
  static Live = Layer.effect(this, LanguageDetection)
}

const getFileExtension = (filename: string): string => {
  const extension = filename.split('.').pop()
  return extension ? extension : ''
}


type LanguageKey = keyof typeof extensionToLanguageMap
export type Language = (typeof extensionToLanguageMap)[LanguageKey]



export interface CodeReview {
  codeReviewFor(
    file: PullRequestFile
  ): Effect.Effect<ChainValues, NoSuchElementException | UnknownException, DetectLanguage>
  codeReviewForChunks(
    file: PullRequestFile
  ): Effect.Effect<ChainValues, NoSuchElementException | UnknownException, DetectLanguage>
}

export const CodeReview = Context.GenericTag<CodeReview>('CodeReview')

// export interface CreateConsolidatedReviewCommentRequest {
//   owner: string
//   repo: string
//   commit_id: string
//   pull_number: number
//   body: string
//   file: PullRequestFile
//   comments: string[]
// }
export class CodeReviewClass implements CodeReview {
  private llm: BaseChatModel
  private chatPrompt = ChatPromptTemplate.fromPromptMessages([
    SystemMessagePromptTemplate.fromTemplate(
      systemPrompt
    ),
    HumanMessagePromptTemplate.fromTemplate(instructionsPrompt)
  ])

  private chain: LLMChain<string>

  constructor(llm: BaseChatModel) {
    this.llm = llm
    this.chain = new LLMChain({
      prompt: this.chatPrompt,
      llm: this.llm
    })
  }

  codeReviewFor = (
    file: PullRequestFile
  ): Effect.Effect<ChainValues, NoSuchElementException | UnknownException, DetectLanguage> =>
    DetectLanguage.pipe(
      Effect.flatMap(DetectLanguage => DetectLanguage.detectLanguage(file.filename)),
      Effect.flatMap(lang =>
        Effect.retry(
          Effect.tryPromise(() => this.chain.call({ lang, diff: file.patch })),
          exponentialBackoffWithJitter(3)
        )
      )
    )

  codeReviewForChunks(
    file: PullRequestFile
  ): Effect.Effect<ChainValues[], NoSuchElementException | UnknownException, DetectLanguage> {
    const programmingLanguage = DetectLanguage.pipe(
      Effect.flatMap(DetectLanguage => DetectLanguage.detectLanguage(file.filename))
    )
    const fileDiff = Effect.sync(() => parseDiff(file.patch)[0])

    return Effect.all([programmingLanguage, fileDiff]).pipe(
      Effect.flatMap(([lang, fd]) =>
        Effect.all(fd.chunks.map(chunk => Effect.tryPromise(() => this.chain.call({ lang, diff: chunk.content }))))
      )
    )
  }
}

export type ArrElement<ArrType> = ArrType extends readonly (infer ElementType)[] ? ElementType : never

export const exponentialBackoffWithJitter = (retries = 3) =>
    Schedule.recurs(retries).pipe(Schedule.compose(Schedule.exponential(1000, 2)), Schedule.jittered)
  
  const RETRIES = 3
  
  export const retryWithBackoff = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.retry(effect, exponentialBackoffWithJitter(RETRIES))
  