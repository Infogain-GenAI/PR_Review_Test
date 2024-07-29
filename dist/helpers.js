import { minimatch } from 'minimatch';
import * as core from '@actions/core';
import { systemPrompt, instructionsPrompt, extensionToLanguageMap } from './constants.js';
import { Effect, Context, Option, Layer, Schedule } from 'effect';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from 'langchain/prompts';
import { LLMChain } from 'langchain/chains';
import parseDiff from 'parse-diff';
export const octokitTag = Context.GenericTag('octokit');
export const PullRequestService = Context.GenericTag('PullRequestService');
export class PullRequestServiceImpl {
    getFilesForReview = (owner, repo, pullNumber, excludeFilePatterns) => {
        const program = octokitTag.pipe(Effect.flatMap(octokit => Effect.retry(Effect.tryPromise(() => octokit.rest.pulls.listFiles({ owner, repo, pull_number: pullNumber, per_page: 100 })), exponentialBackoffWithJitter(3))), Effect.tap(pullRequestFiles => Effect.sync(() => core.info(`Original files for review ${pullRequestFiles.data.length}: ${pullRequestFiles.data.map(_ => _.filename)}`))), Effect.flatMap(pullRequestFiles => Effect.sync(() => pullRequestFiles.data.filter(file => {
            return (excludeFilePatterns.every(pattern => !minimatch(file.filename, pattern, { matchBase: true })) &&
                (file.status === 'modified' || file.status === 'added' || file.status === 'changed'));
        }))), Effect.tap(filteredFiles => Effect.sync(() => core.info(`Filtered files for review ${filteredFiles.length}: ${filteredFiles.map(_ => _.filename)}`))));
        return program;
    };
    createReviewComment = (requestOptions) => octokitTag.pipe(Effect.tap(_ => core.debug(`Creating review comment: ${JSON.stringify(requestOptions)}`)), Effect.flatMap(octokit => Effect.retry(Effect.tryPromise(() => octokit.rest.pulls.createReviewComment(requestOptions)), exponentialBackoffWithJitter(3))));
    createReview = (requestOptions) => octokitTag.pipe(Effect.flatMap(octokit => Effect.retry(Effect.tryPromise(() => octokit.rest.pulls.createReview(requestOptions)), exponentialBackoffWithJitter(3))));
}
const makeLanguageDetectionService = Effect.sync(() => {
    return {
        detectLanguage: (filename) => {
            const extension = getFileExtension(filename);
            return Option.fromNullable(extensionToLanguageMap[extension]);
        }
    };
});
export class LanguageDetectionService extends Context.Tag('LanguageDetectionService')() {
    static Live = Layer.effect(this, makeLanguageDetectionService);
}
const getFileExtension = (filename) => {
    const extension = filename.split('.').pop();
    return extension ? extension : '';
};
export const CodeReviewService = Context.GenericTag('CodeReviewService');
export class CodeReviewServiceImpl {
    llm;
    chatPrompt = ChatPromptTemplate.fromPromptMessages([
        SystemMessagePromptTemplate.fromTemplate(systemPrompt),
        HumanMessagePromptTemplate.fromTemplate(instructionsPrompt)
    ]);
    chain;
    constructor(llm) {
        this.llm = llm;
        this.chain = new LLMChain({
            prompt: this.chatPrompt,
            llm: this.llm
        });
    }
    codeReviewFor = (file) => LanguageDetectionService.pipe(Effect.flatMap(languageDetectionService => languageDetectionService.detectLanguage(file.filename)), Effect.flatMap(lang => Effect.retry(Effect.tryPromise(() => this.chain.call({ lang, diff: file.patch })), exponentialBackoffWithJitter(3))));
    codeReviewForChunks(file) {
        const programmingLanguage = LanguageDetectionService.pipe(Effect.flatMap(languageDetectionService => languageDetectionService.detectLanguage(file.filename)));
        const fileDiff = Effect.sync(() => parseDiff(file.patch)[0]);
        return Effect.all([programmingLanguage, fileDiff]).pipe(Effect.flatMap(([lang, fd]) => Effect.all(fd.chunks.map(chunk => Effect.tryPromise(() => this.chain.call({ lang, diff: chunk.content }))))));
    }
}
export const exponentialBackoffWithJitter = (retries = 3) => Schedule.recurs(retries).pipe(Schedule.compose(Schedule.exponential(1000, 2)), Schedule.jittered);
const RETRIES = 3;
export const retryWithBackoff = (effect) => Effect.retry(effect, exponentialBackoffWithJitter(RETRIES));
//# sourceMappingURL=helpers.js.map