import * as core from '@actions/core';
import * as github from '@actions/github';
import { wait } from './wait.js';
import { ChatOpenAI } from 'langchain/chat_models/openai';
// import { ChatOpenAI } from '@langchain/openai';
import { systemPrompt, instructionsPrompt, extensionToLanguageMap } from './constants.js';
import { Option, Context, Effect, Layer, Schedule } from 'effect';
import parseDiff from 'parse-diff';
// import { LLMChain, OpenAI, LocalStorage } from '@langchain/langchain';
import { LLMChain } from 'langchain/chains';
//import type { ChainValues } from 'langchain/dist/schema';
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from 'langchain/prompts';
const openAIApiKey = core.getInput('openai_api_key');
const githubToken = core.getInput('github_token');
const modelName = core.getInput('model_name');
const temperature = parseInt(core.getInput('model_temperature'));
const azureOpenAIApiKey = core.getInput('azure_openai_api_key');
const azureOpenAIApiInstanceName = core.getInput('azure_openai_api_instance_name');
const azureOpenAIApiDeploymentName = core.getInput('azure_openai_api_deployment_name');
const azureOpenAIApiVersion = core.getInput('azure_openai_api_version');
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
        const ms = core.getInput('milliseconds');
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
    const azureOpenAIApiKey = core.getInput('azure_openai_api_key');
    const azureOpenAIApiInstanceName = core.getInput('azure_openai_api_instance_name');
    const azureOpenAIApiDeploymentName = core.getInput('azure_openai_api_deployment_name');
    const azureOpenAIApiVersion = core.getInput('azure_openai_api_version');
    return new ChatOpenAI({
        temperature,
        azureOpenAIApiKey,
        azureOpenAIApiInstanceName,
        azureOpenAIApiDeploymentName,
        azureOpenAIApiVersion
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
// export class CodeReviewServiceImpl {
//   private llm: BaseChatModel
//   private chatPrompt = ChatPromptTemplate.fromPromptMessages([
//     SystemMessagePromptTemplate.fromTemplate(
//       "Act as an empathetic software engineer that's an expert in designing and developing React based frontend softwares based on Redux Middleware and Saga framework and adhering to best practices of software architecture."
//     ),
//     HumanMessagePromptTemplate.fromTemplate(`Your task is to review a Pull Request. You will receive a git diff.
//     Review it and suggest any improvements in code quality, maintainability, readability, performance, security, etc.
//     Identify any potential bugs or security vulnerabilities. Check it adheres to the following coding standards and guidelines:
//     1. Redux Setup:
//     a.Check that Redux is set up correctly with reducers, actions, and the store.
//     b.Verify that action types are defined as constants and are consistent across the application.
//     c.Ensure that action creators are used to encapsulate action logic and avoid direct manipulation of action objects.
//     2. Redux Middleware:
//     a.Review the usage of Redux Middleware for tasks such as logging, error handling, or asynchronous operations.
//     b.Ensure that middleware functions are pure and do not cause side effects unrelated to Redux state management.
//     c.Check for proper error handling in middleware to prevent application crashes and provide meaningful error messages to users.
//     3. Saga Implementation:
//     a.Evaluate the usage of Redux Saga for handling asynchronous logic and side effects.
//     b.Verify that sagas are structured appropriately, with clear separation of concerns and minimal coupling between sagas.
//     c.Check for proper error handling in sagas, including handling of failed API requests and other asynchronous operations.
//     4.Component Architecture:
//     a.Review the component architecture to ensure adherence to best practices and maintainability.
//     b.Check for proper separation of container and presentational components, with container components responsible for connecting to Redux and managing state.
//     c.Ensure that components are reusable, composable, and focused on a single responsibility.
//     5.State Management:
//     a.Evaluate the usage of Redux for state management, considering factors such as the size and complexity of the application.
//     b.Check for appropriate normalization of state, especially for nested or relational data structures.
//     c.Verify that selectors are used to derive derived data from the Redux store efficiently.
//     6.Code Organization and Structure:
//     a.Check that the project structure follows best practices and is organized logically.
//     b.Ensure that files and folders are named descriptively and consistently.
//     c.Verify that code is modular and follows the single responsibility principle, with each module responsible for a specific feature or functionality.
//     7.Error Handling:
//     a.Evaluate error handling mechanisms throughout the codebase, including in Redux actions, reducers, middleware, and sagas.
//     b.Check for consistent error handling patterns and ensure that errors are handled gracefully to prevent application crashes and provide a good user experience.
//     8.Performance Optimization:
//     a. Review code for potential performance bottlenecks and inefficiencies.
//     b. Check for unnecessary re-renders in React components and identify opportunities for optimization using techniques such as memoization and PureComponent.
//     c. Evaluate the usage of Redux selectors and memoization to improve performance when accessing derived data from the store.
//     9.Testing:
//     a.Verify that the codebase is adequately covered by unit tests, integration tests, and end-to-end tests.
//     b.Check for proper mocking of external dependencies, such as APIs and services, in tests to ensure isolation and reproducibility.
//     c.Evaluate test coverage and identify areas where additional tests are needed to improve code quality and reliability.
//     10.Documentation and Comments:
//     a.Ensure that code is well-documented with comments, especially for complex logic or algorithms.
//     b.Check that documentation is up-to-date and accurately reflects the behavior and usage of functions, components, and modules.
//     c.Encourage the use of README files and other documentation to provide an overview of the project structure, architecture, and development workflow.
// Write your reply and examples in GitHub Markdown format.
// The programming language in the git diff is {lang}.
//     git diff to review
//     {diff}`)
//   ])
//   private chain: LLMChain<string>
//   constructor(llm: BaseChatModel) {
//     this.llm = llm
//     this.chain = new LLMChain({
//       prompt: this.chatPrompt,
//       llm: this.llm
//     })
//   }
//   codeReviewFor = (
//     file: PullRequestFile
//   ): Effect.Effect<ChainValues, NoSuchElementException | UnknownException, LanguageDetectionService> =>
//     LanguageDetectionService.pipe(
//       Effect.flatMap(languageDetectionService => languageDetectionService.detectLanguage(file.filename)),
//       Effect.flatMap(lang =>
//         Effect.retry(
//           Effect.tryPromise(() => this.chain.call({ lang, diff: file.patch })),
//           exponentialBackoffWithJitter(3)
//         )
//       )
//     )
//   codeReviewForChunks(
//     file: PullRequestFile
//   ): Effect.Effect<ChainValues[], NoSuchElementException | UnknownException, LanguageDetectionService> {
//     const programmingLanguage = LanguageDetectionService.pipe(
//       Effect.flatMap(languageDetectionService => languageDetectionService.detectLanguage(file.filename))
//     )
//     const fileDiff = Effect.sync(() => parseDiff(file.patch)[0])
//     return Effect.all([programmingLanguage, fileDiff]).pipe(
//       Effect.flatMap(([lang, fd]) =>
//         Effect.all(fd.chunks.map(chunk => Effect.tryPromise(() => this.chain.call({ lang, diff: chunk.content }))))
//       )
//     )
//   }
// }
export const exponentialBackoffWithJitter = (retries = 3) => Schedule.recurs(retries).pipe(Schedule.compose(Schedule.exponential(1000, 2)), Schedule.jittered);
const RETRIES = 3;
export const retryWithBackoff = (effect) => Effect.retry(effect, exponentialBackoffWithJitter(RETRIES));
//# sourceMappingURL=main.js.map