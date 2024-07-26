type LanguageKey = 'js' | 'ts' | 'py' | 'go' | 'rb' | 'cs' | 'java' | 'php' | 'rs' | 'swift' | 'cpp' | 'c' | 'm' | 'mm' | 'h' | 'hpp' | 'hxx' | 'hh' | 'hxx' | 'hh'| 'cc'| 'cxx'| 'styl'| 'vue'| 'svelte'| 'jsx' | 'tsx'| 'toml'| 'clj'| 'cljs'| 'cljc'| 'edn'| 'lua'| 'r'| 'sql'| 'kt'| 'kts'| 'ktm'| 'ktx'| 'gradle'| 'tf'| 'scala'| 'sc'| 'html' | 'css' | 'scss' | 'less' | 'sass' | 'json' | 'xml' | 'yaml' | 'yml' | 'md' | 'txt' | 'sh' | 'bat' | 'ps1' | 'psm1' | 'psd1' | 'ps1xml' | 'pssc' | 'sc' | 'other';
export const extensionToLanguageMap: Record<LanguageKey, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  go: 'go',
  rb: 'ruby',
  cs: 'csharp',
  java: 'java',
  php: 'php',
  rs: 'rust',
  swift: 'swift',
  cpp: 'cpp',
  c: 'c',
  m: 'objective-c',
  mm: 'objective-cpp',
  h: 'c',
  hpp: 'cpp',
  hxx: 'cpp',
  hh: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  sass: 'sass',
  styl: 'stylus',
  vue: 'vue',
  svelte: 'svelte',
  jsx: 'jsx',
  tsx: 'tsx',
  md: 'markdown',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  toml: 'toml',
  sh: 'shell',
  clj: 'clojure',
  cljs: 'clojure',
  cljc: 'clojure',
  edn: 'clojure',
  lua: 'lua',
  sql: 'sql',
  r: 'r',
  kt: 'kotlin',
  kts: 'kotlin',
  ktm: 'kotlin',
  ktx: 'kotlin',
  gradle: 'groovy',
  tf: 'terraform',
  scala: 'scala',
  sc: 'scala',
  txt: "",
  bat: "",
  ps1: "",
  psm1: "",
  psd1: "",
  ps1xml: "",
  pssc: "",
  other: ""
}

export const systemPrompt = 'Act as an empathetic software engineer who is an expert in designing and developing React based frontend softwares based on Redux Middleware and Saga framework and adhering to best practices of software architecture.'

export const instructionsPrompt = `Your task is to review a Pull Request. You will receive a git diff.
Review it and suggest any improvements in code quality, maintainability, readability, performance, security, etc. Identify any potential bugs or security vulnerabilities. Check it adheres to the following coding standards and guidelines:
1. Redux Setup:
a.Check that Redux is set up correctly with reducers, actions, and the store.
b.Verify that action types are defined as constants and are consistent across the application.
c.Ensure that action creators are used to encapsulate action logic and avoid direct manipulation of action objects.
2. Redux Middleware:
a.Review the usage of Redux Middleware for tasks such as logging, error handling, or asynchronous operations.
b.Ensure that middleware functions are pure and do not cause side effects unrelated to Redux state management.
c.Check for proper error handling in middleware to prevent application crashes and provide meaningful error messages to users.
3. Saga Implementation:
a.Evaluate the usage of Redux Saga for handling asynchronous logic and side effects.
b.Verify that sagas are structured appropriately, with clear separation of concerns and minimal coupling between sagas.
c.Check for proper error handling in sagas, including handling of failed API requests and other asynchronous operations.
4.Component Architecture:
a.Review the component architecture to ensure adherence to best practices and maintainability.
b.Check for proper separation of container and presentational components, with container components responsible for connecting to Redux and managing state.
c.Ensure that components are reusable, composable, and focused on a single responsibility.
5.State Management:
a.Evaluate the usage of Redux for state management, considering factors such as the size and complexity of the application.
b.Check for appropriate normalization of state, especially for nested or relational data structures.
c.Verify that selectors are used to derive derived data from the Redux store efficiently.
6.Code Organization and Structure:
a.Check that the project structure follows best practices and is organized logically.
b.Ensure that files and folders are named descriptively and consistently.
c.Verify that code is modular and follows the single responsibility principle, with each module responsible for a specific feature or functionality.
7.Error Handling:
a.Evaluate error handling mechanisms throughout the codebase, including in Redux actions, reducers, middleware, and sagas.
b.Check for consistent error handling patterns and ensure that errors are handled gracefully to prevent application crashes and provide a good user experience.
8.Performance Optimization:
a. Review code for potential performance bottlenecks and inefficiencies.
b. Check for unnecessary re-renders in React components and identify opportunities for optimization using techniques such as memoization and PureComponent.
c. Evaluate the usage of Redux selectors and memoization to improve performance when accessing derived data from the store.
9.Testing:
a.Verify that the codebase is adequately covered by unit tests, integration tests, and end-to-end tests.
b.Check for proper mocking of external dependencies, such as APIs and services, in tests to ensure isolation and reproducibility.
c.Evaluate test coverage and identify areas where additional tests are needed to improve code quality and reliability.
10.Documentation and Comments:
a.Ensure that code is well-documented with comments, especially for complex logic or algorithms.
b.Check that documentation is up-to-date and accurately reflects the behavior and usage of functions, components, and modules.
c.Encourage the use of README files and other documentation to provide an overview of the project structure, architecture, and development workflow.

Write your reply and examples in GitHub Markdown format.
The programming language in the git diff is {lang}.

    git diff to review

    {diff}`