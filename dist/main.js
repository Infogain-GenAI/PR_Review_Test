import * as core from '@actions/core';
import * as github from '@actions/github';
import { wait } from './wait.js';
import { ChatOpenAI } from 'langchain/chat_models/openai';
// import { ChatOpenAI } from '@langchain/openai';
import { systemPrompt, instructionsPrompt, extensionToLanguageMap } from './constants.js';
import { Option, Context, Effect, Layer } from 'effect';
import parseDiff from 'parse-diff';
// import { LLMChain, OpenAI, LocalStorage } from '@langchain/langchain';
import { LLMChain } from 'langchain/chains';
//import type { ChainValues } from 'langchain/dist/schema';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from 'langchain/prompts';
const openAIApiKey = core.getInput('openai_api_key');
const githubToken = core.getInput('github_token');
const modelName = core.getInput('model_name');
const temperature = parseInt(core.getInput('model_temperature'));
// const azureOpenAIApiKey = core.getInput('azure_openai_api_key')
// const azureOpenAIApiInstanceName = core.getInput('azure_openai_api_instance_name')
// const azureOpenAIApiDeploymentName = core.getInput('azure_openai_api_deployment_name')
// const azureOpenAIApiVersion = core.getInput('azure_openai_api_version')
const model = new ChatOpenAI({
    temperature,
    openAIApiKey,
    modelName,
    // azureOpenAIApiKey,
    // azureOpenAIApiInstanceName,
    // azureOpenAIApiDeploymentName,
    // azureOpenAIApiVersion
});
const prompt = ChatPromptTemplate.fromPromptMessages([
    SystemMessagePromptTemplate.fromTemplate(systemPrompt), HumanMessagePromptTemplate.fromTemplate(instructionsPrompt)
]);
/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run() {
    try {
        // const ms: string = core.getInput('milliseconds');
        const ms = '100';
        const msNumber = parseInt(ms, 10);
        const githubToken = core.getInput('github_token');
        const octokit = github.getOctokit(githubToken);
        const { owner, repo } = github.context.repo;
        // Initialize the model with necessary parameters
        const model = initializeModel();
        // Create the LLMChain with OpenAI and optional LocalStorage for caching
        const llmChain = new LLMChain({
            prompt: prompt,
            llm: model,
            outputKey: 'content'
            //storage: new LocalStorage(), // Uncomment if caching is needed
        });
        // Example of running a chain with a prompt
        await runLLMChain(llmChain, "Example prompt");
        // Wait for a specified amount of time
        await performWait(ms);
        // Example of handling pull requests
        await handlePullRequests(octokit, owner, repo);
    }
    catch (error) {
        handleError(error);
    }
}
function initializeModel() {
    const temperature = parseInt(core.getInput('model_temperature'));
    const openAIApiKey = core.getInput('openai_api_key');
    const githubToken = core.getInput('github_token');
    const modelName = core.getInput('model_name');
    // const azureOpenAIApiKey = core.getInput('azure_openai_api_key');
    // const azureOpenAIApiInstanceName = core.getInput('azure_openai_api_instance_name');
    // const azureOpenAIApiDeploymentName = core.getInput('azure_openai_api_deployment_name');
    // const azureOpenAIApiVersion = core.getInput('azure_openai_api_version');
    return new ChatOpenAI({
        temperature,
        openAIApiKey,
        modelName
        // azureOpenAIApiKey,
        // azureOpenAIApiInstanceName,
        // azureOpenAIApiDeploymentName,
        // azureOpenAIApiVersion
    });
}
async function runLLMChain(llmChain, prompt) {
    try {
        const response = await llmChain.call({ content: prompt });
        console.log('Response:', response);
    }
    catch (error) {
        console.error('Error running LLMChain:', error);
    }
}
async function performWait(ms) {
    core.debug(`Waiting ${ms} milliseconds ...`);
    core.debug(new Date().toTimeString());
    await wait(parseInt(ms, 10));
    core.debug(new Date().toTimeString());
    core.setOutput('time', new Date().toTimeString());
}
async function handlePullRequests(octokit, owner, repo) {
    const pullRequest = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: github.context.issue.number,
    });
    const files = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pullRequest.data.number,
    });
    //getReviewCommentsfor each file
    for (const file of files.data) {
        const comments = await octokit.rest.pulls.listReviewComments({
            owner,
            repo,
            pull_number: pullRequest.data.number,
        });
        const language = await detectLanguage(file.filename);
        const fileDiff = Effect.sync(() => parseDiff(file.patch)[0]);
        if (language) {
            const content = await getFileContent(octokit, owner, repo, file.filename);
            const fileDiff = await getFileDiff(octokit, owner, repo, pullRequest.data.number, file.filename);
            const fileDiffPrompt = `Review the following file diff for ${file.filename}:\n${fileDiff}`;
            const response = await runLLMChain(new LLMChain({
                prompt: prompt,
                llm: model
            }), fileDiffPrompt);
            if (response !== undefined) {
                await createReviewComment(octokit, owner, repo, pullRequest.data.number, file.filename, response);
            }
        }
    }
}
async function createReviewComment(octokit, owner, repo, pullNumber, path, body) {
    await octokit.rest.pulls.createReviewComment({
        owner,
        repo,
        pull_number: pullNumber,
        body,
        path,
        position: 1 // Adjust the position as needed
    });
}
async function getFileDiff(octokit, owner, repo, pullNumber, filename) {
    const diffResponse = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
        mediaType: {
            format: 'diff'
        }
    });
    const diffs = parseDiff(diffResponse.data);
    const fileDiff = diffs.find(diff => diff.to === filename);
    return fileDiff ? fileDiff.chunks.map(chunk => chunk.content).join('\n') : '';
}
async function getFileContent(octokit, owner, repo, filename) {
    const fileContent = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: filename,
    });
    return Buffer.from(fileContent.data.content, 'base64').toString();
}
function handleError(error) {
    if (error instanceof Error)
        core.setFailed(error.message);
}
export { handleError };
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
async function detectLanguage(filename) {
    const extension = getFileExtension(filename);
    const language = extensionToLanguageMap[extension];
    return language || null;
}
//# sourceMappingURL=main.js.map