import { config } from 'dotenv';
import * as core from '@actions/core';
import * as github from '@actions/github';
import { ChatOpenAI } from 'langchain/chat_models';
import { Effect, Layer, Match, pipe, Exit } from 'effect';
import { CodeReview, CodeReviewClass, DetectLanguage, octokitTag, PullRequest, PullRequestClass } from './helpers.js';
config();
export const run = async () => {
    const openAIApiKey = core.getInput('openai_api_key');
    const githubToken = core.getInput('github_token');
    const modelName = core.getInput('model_name');
    const temperature = parseInt(core.getInput('model_temperature'));
    //   const azureOpenAIApiKey = core.getInput('azure_openai_api_key')
    //   const azureOpenAIApiInstanceName = core.getInput('azure_openai_api_instance_name')
    //   const azureOpenAIApiDeploymentName = core.getInput('azure_openai_api_deployment_name')
    //   const azureOpenAIApiVersion = core.getInput('azure_openai_api_version')
    const context = github.context;
    const { owner, repo } = context.repo;
    const model = new ChatOpenAI({
        temperature,
        openAIApiKey,
        modelName,
        // azureOpenAIApiKey,
        // azureOpenAIApiInstanceName,
        // azureOpenAIApiDeploymentName,
        // azureOpenAIApiVersion
    });
    const MainLive = init(model, githubToken);
    const program = Match.value(context.eventName).pipe(Match.when('pull_request', () => {
        core.info('Entering pull_request match block'); // Logging start of pull_request block
        const excludeFilePatterns = pipe(Effect.sync(() => github.context.payload), Effect.tap(pullRequestPayload => Effect.sync(() => {
            core.info(`repoName: ${repo} pull_number: ${context.payload.number} owner: ${owner} sha: ${pullRequestPayload.pull_request.head.sha}`);
        })), Effect.map(() => core
            .getInput('exclude_files')
            .split(',')
            .map(_ => _.trim())));
        const a = excludeFilePatterns.pipe(Effect.flatMap(filePattens => PullRequest.pipe(Effect.flatMap(PullRequest => PullRequest.getFilesForReview(owner, repo, context.payload.number, filePattens)), Effect.flatMap(files => Effect.sync(() => files.filter(file => file.patch !== undefined))), 
        // Effect.flatMap(files =>
        //   Effect.sync(() => {
        //     core.info(`Check Files for review: ${files.length}`)
        //     return files
        //   }) // Log files for review
        // ),
        Effect.flatMap(files => Effect.forEach(files, file => CodeReview.pipe(Effect.flatMap(CodeReview => CodeReview.codeReviewFor(file)), Effect.tap(res => Effect.sync(() => core.info(`Test Review file count: ${files.length},'Filename: '${file.filename}`))), Effect.flatMap(res => {
            // Ensure res is an array
            const comments = Array.isArray(res) ? res : [res];
            const data = PullRequest.pipe(Effect.flatMap(PullRequest => PullRequest.createReviewComment({
                repo,
                owner,
                pull_number: context.payload.number,
                commit_id: context.payload.pull_request?.head.sha,
                path: file.filename,
                body: res.text, // Consolidate comments//res.text,
                subject_type: 'file'
            })));
            console.info('Print before return data', data);
            return data;
        })))))));
        console.info('Print before return a', a);
        core.info('Exiting pull_request match block'); // Logging end
        return a;
    }), Match.orElse(eventName => Effect.sync(() => {
        core.setFailed(`This action only works on pull_request events. Got: ${eventName}`);
    })));
    const runnable = Effect.provide(program, MainLive);
    const result = await Effect.runPromiseExit(runnable);
    if (Exit.isFailure(result)) {
        core.setFailed(result.cause.toString());
    }
};
const init = (model, githubToken) => {
    const CodeReviewLive = Layer.effect(CodeReview, Effect.map(DetectLanguage, _ => CodeReview.of(new CodeReviewClass(model))));
    const octokitLive = Layer.succeed(octokitTag, github.getOctokit(githubToken));
    const PullRequestLive = Layer.effect(PullRequest, Effect.map(octokitTag, _ => PullRequest.of(new PullRequestClass())));
    const mainLive = CodeReviewLive.pipe(Layer.merge(PullRequestLive), Layer.merge(DetectLanguage.Live), Layer.merge(octokitLive), Layer.provide(DetectLanguage.Live), Layer.provide(octokitLive));
    return mainLive;
};
run();
//# sourceMappingURL=main.js.map