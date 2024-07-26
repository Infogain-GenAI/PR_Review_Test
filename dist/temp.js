// // import * as core from '@actions/core'
// // import * as github from '@actions/github'
// // import { wait } from './wait'
// // import { ChatOpenAI } from '@langchain/openai'
// // import {systemPrompt, instructionsPrompt} from './constants'
// // import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';
export {};
// // /**
// //  * The main function for the action.
// //  * @returns {Promise<void>} Resolves when the action is complete.
// //  */
// // export async function run(): Promise<void> {
// //   try {
// //     const ms: string = core.getInput('milliseconds')
// //     const githubToken = core.getInput('github_token')
// //     const temperature = parseInt(core.getInput('model_temperature'))
// //     const azureOpenAIApiKey = core.getInput('azure_openai_api_key')
// //     const azureOpenAIApiInstanceName = core.getInput('azure_openai_api_instance_name')
// //     const azureOpenAIApiDeploymentName = core.getInput('azure_openai_api_deployment_name')
// //     const azureOpenAIApiVersion = core.getInput('azure_openai_api_version')
// //     const context = github.context
// //     const model = new ChatOpenAI({
// //       temperature,
// //       azureOpenAIApiKey,
// //       azureOpenAIApiInstanceName,
// //       azureOpenAIApiDeploymentName,
// //       azureOpenAIApiVersion
// //     })
// //     const pullRequest = await octokit.pulls.get({
// //         owner: context.repo.owner,
// //         repo: context.repo.repo,
// //         pull_number: context.issue.number,
// //     });
// //     const files = await octokit.pulls.listFiles({
// //         owner: context.repo.owner,
// //         repo: context.repo.repo,
// //         pull_number: pullRequest.data.number,
// //     });
// //     for (const file of files.data) {
// //         const comments: RestEndpointMethodTypes["pulls"]["listComments"]["response"]["data"] = await octokit.pulls.listComments({
// //             owner: context.repo.owner,
// //             repo: context.repo.repo,
// //             pull_number: pullRequest.data.number,
// //         });
// //         const fileComments = comments.data.filter((comment) => comment.path === file.filename);
// //         console.log(`Comments for file ${file.filename}:`, fileComments);
// //       console.log(file.filename);
// //     }
// //     for (const file of files.data) {
// //       const comments = await octokit.pulls.listComments({
// //         owner: context.repo.owner,
// //         repo: context.repo.repo,
// //         pull_number: pullRequest.data.number,
// //       });
// //       const fileComments = comments.data.filter((comment: RestEndpointMethodTypes["pulls"]["listComments"]["response"]["data"][0]) => comment.path === file.filename);
// //       console.log(`Comments for file ${file.filename}:`, fileComments);
// //     }
// //     await model.invoke([
// //       ["system", systemPrompt],
// //       ["human", instructionsPrompt],
// //     ]);
// //     core.debug(`Waiting ${ms} milliseconds ...`)
// //     core.debug(new Date().toTimeString())
// //     await wait(parseInt(ms, 10))
// //     core.debug(new Date().toTimeString())
// //     core.setOutput('time', new Date().toTimeString())
// //   } catch (error) {
// //     if (error instanceof Error) core.setFailed(error.message)
// //   }
// // }
// import * as core from '@actions/core'
// import * as github from '@actions/github'
// import { wait } from './wait'
// import { ChatOpenAI } from '@langchain/openai'
// import {systemPrompt, instructionsPrompt, extensionToLanguageMap} from './constants'
// import { Octokit } from '@octokit/rest';
// // import { CommentType, PullRequestFile } from '@octokit/rest/dist-types/types';
// import { Option, Context, Effect, Layer } from 'effect'
// //import { extensionToLanguageMap } from './constants';
// import type { ChainValues } from 'langchain/dist/schema'
// import { NoSuchElementException, UnknownException } from 'effect/Cause'
// // import { exponentialBackoffWithJitter } from 'effect/Retry'
// import parseDiff from 'parse-diff'
// // import { LLMChain } from 'langchain/chains'
// import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types'
// import { LLMChain, OpenAI, LocalStorage } from '@langchain/langchain';
// // Define the CommentType
// type CommentType = {
//   id: number;
//   user: {
//     login: string;
//   };
//   body: string;
//   path: string;
//   position: number;
//   line: number;
// };
// export type PullRequestFileResponse = RestEndpointMethodTypes['pulls']['listFiles']['response']
// export type PullRequestFile = ArrElement<PullRequestFileResponse['data']>
// type CreateReviewCommentRequest = RestEndpointMethodTypes['pulls']['createReviewComment']['parameters']
// type CreateReviewRequest = RestEndpointMethodTypes['pulls']['createReview']['parameters']
// /**
//  * Utility type to infer the element type of an array
//  */
// export type ArrElement<ArrType> = ArrType extends readonly (infer ElementType)[] ? ElementType : never
// /**
//  * The main function for the action.
//  * @returns {Promise<void>} Resolves when the action is complete.
//  */
// export async function run(): Promise<void> {
//   try {
//     const ms: string = core.getInput('milliseconds')
//     const openAIApiKey = core.getInput('openai_api_key')
//     const githubToken = core.getInput('github_token')
//     const modelName = core.getInput('model_name')
//     const temperature = parseInt(core.getInput('model_temperature'))
//     const azureOpenAIApiKey = core.getInput('azure_openai_api_key')
//     const azureOpenAIApiInstanceName = core.getInput('azure_openai_api_instance_name')
//     const azureOpenAIApiDeploymentName = core.getInput('azure_openai_api_deployment_name')
//     const azureOpenAIApiVersion = core.getInput('azure_openai_api_version')
//     const octokit = github.getOctokit(githubToken);
//     const context = github.context
//     const { owner, repo } = context.repo
//     const model = new ChatOpenAI({
//       temperature,
//       //openAIApiKey,
//       //modelName,
//       azureOpenAIApiKey,
//       azureOpenAIApiInstanceName,
//       azureOpenAIApiDeploymentName,
//       azureOpenAIApiVersion
//     })
//     // Create the LLMChain with OpenAI and optional LocalStorage for caching
//     const llmChain = new LLMChain({
//           llms: [OpenAI],
//           //storage: storage, // This is optional. Remove if you don't need caching.
//       });
//     // Define a function to run the LLMChain with a prompt
//     async function runLLMChain(prompt: string) {
//       try {
//       // Use the LLMChain to process the prompt
//       const response = await llmChain.process(prompt);
//       // Log the response
//       console.log('Response:', response);
//       } catch (error) {
//       console.error('Error running LLMChain:', error);
//       }
//     }
//     const codeReviewFor = (
//       file: PullRequestFile
//     ): Effect.Effect<ChainValues, NoSuchElementException | UnknownException, LanguageDetectionService> => {
//       return LanguageDetectionService.pipe(
//         Effect.flatMap(languageDetectionService => languageDetectionService.detectLanguage(file.filename)),
//         Effect.flatMap(lang =>
//           Effect.retry(
//             Effect.tryPromise(() => this.chain.call({ lang, diff: file.patch })),
//             { retries: 3, delay: 1000 }
//           )
//         )
//       )
//     }
//     const codeReviewForChunks = (
//       file: PullRequestFile
//     ): Effect.Effect<ChainValues[], NoSuchElementException | UnknownException, LanguageDetectionService> => {
//       const programmingLanguage = LanguageDetectionService.pipe(
//         Effect.flatMap(languageDetectionService => languageDetectionService.detectLanguage(file.filename))
//       )
//       const fileDiff = Effect.sync(() => parseDiff(file.patch)[0])
//       return Effect.all([programmingLanguage, fileDiff]).pipe(
//         Effect.flatMap(([lang, fd]) =>
//           Effect.all(fd.chunks.map((chunk: any) => Effect.tryPromise(() => this.chain.call({ lang, diff: chunk.content }))))
//         )
//       )
//     }
//     //getFilesfor Review      
//       const { data: pullRequest } = await octokit.rest.pulls.get({
//         owner: github.context.repo.owner,
//         repo: github.context.repo.repo,
//         pull_number: github.context.issue.number,
//       });
//       // ...
//       const { data: files } = await octokit.rest.pulls.listFiles({
//         owner: github.context.repo.owner,
//         repo: github.context.repo.repo,
//         pull_number: pullRequest.number,
//       });
//       // Now 'files' contains the list of files in the pull request
//       // ...
//     //getReviewCommentsfor each file   
//       for (const file of files) {
//         const { data: comments } = await octokit.rest.pulls.listReviewComments({
//           owner: github.context.repo.owner,
//           repo: github.context.repo.repo,
//           pull_number: pullRequest.number,
//         });
//         const fileComments = comments.filter((comment: CommentType) => comment.path === file.filename);
//         console.log(`Comments for file ${file.filename}:`, fileComments);
//       }
//       // ...   
//       // run AZOpenAI for each file
//         const res = await model.invoke([
//           ["system", systemPrompt],
//           ["human", instructionsPrompt],
//         ]);
//         // Run the LLMChain with the example prompt
//         runLLMChain(instructionsPrompt);
//         // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
//         core.debug(`Waiting ${ms} milliseconds ...`)
//       // Log the current timestamp, wait, then log the new timestamp
//       core.debug(new Date().toTimeString())
//         await wait(parseInt(ms, 10))
//       core.debug(new Date().toTimeString())
//     // Set outputs for other workflow steps to use
//     core.setOutput('time', new Date().toTimeString())
//   } catch (error) {
//     // Fail the workflow run if an error occurs
//     if (error instanceof Error) core.setFailed(error.message)
//   }
// }
// const makeLanguageDetectionService = Effect.sync(() => {
//   return {
//     detectLanguage: (filename: string): Option.Option<Language> => {
//       const extension = getFileExtension(filename)
//       return Option.fromNullable(extensionToLanguageMap[extension as LanguageKey])
//     }
//   }
// })
// export class LanguageDetectionService extends Context.Tag('LanguageDetectionService')<
//   LanguageDetectionService,
//   Effect.Effect.Success<typeof makeLanguageDetectionService>
// >() {
//   static Live = Layer.effect(this, makeLanguageDetectionService)
// }
// const getFileExtension = (filename: string): string => {
//   const extension = filename.split('.').pop()
//   return extension ? extension : ''
// }
// type LanguageKey = keyof typeof extensionToLanguageMap
// export type Language = (typeof extensionToLanguageMap)[LanguageKey]
// function exponentialBackoffWithJitter(retries: number): number {
//   const baseDelay = 1000; // 1 second
//   const maxDelay = 60000; // 1 minute
//   const backoffFactor = 2;
//   const jitterFactor = 0.5;
//   const delay = Math.min(baseDelay * Math.pow(backoffFactor, retries), maxDelay);
//   const jitter = Math.random() * delay * jitterFactor;
//   const backoffTime = delay + jitter;
//   return backoffTime;
// }
//# sourceMappingURL=temp.js.map