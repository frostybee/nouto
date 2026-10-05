---
title: "CLI: CI/CD integration"
description: Run Nouto collections in GitHub Actions, GitLab CI, Jenkins, and Azure DevOps, and publish the results as JUnit XML.
sidebar:
  order: 5
---

Run your Nouto collections in a CI pipeline so that a failing API test fails the build. Each example on this page builds the CLI from the Nouto repository, runs a collection stored in your repository, and publishes a JUnit XML report. `nouto run` exits with `1` when a request fails, which fails the pipeline step. See [exit codes](/cli/#exit-codes) for the other codes.

## Before you start

The examples assume that your repository contains these files:

- `tests/api-collection.nouto.json`, a collection exported with **Export** > **Nouto Collection**.
- `tests/environments.json`, an environment file exported with **Export all environments**, with an environment named `CI`.

They also assume that your CI system stores the API token as a secret named `API_TOKEN`, and that neither the environment file nor the collection defines a `token` variable. `--env-var` doesn't replace a variable that another source already defines. See [variable precedence](/cli/configuration#variable-precedence).

The CLI isn't published to npm, so each pipeline clones the Nouto repository and builds the CLI with Node.js and pnpm. To pin the CLI version, check out a specific commit instead of the default branch.

## GitHub Actions

This workflow checks out your repository and Nouto side by side, then runs the collection:

```yaml title=".github/workflows/api-tests.yml"
name: API tests
on: [push, pull_request]

jobs:
  api-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Check out Nouto
        uses: actions/checkout@v4
        with:
          repository: frostybee/nouto
          path: nouto

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Build the Nouto CLI
        working-directory: nouto
        run: |
          corepack enable
          pnpm install --frozen-lockfile --filter "@nouto/cli..."
          pnpm run build:core
          pnpm run build:cli

      - name: Run API tests
        env:
          API_TOKEN: ${{ secrets.API_TOKEN }}
        run: |
          node nouto/packages/cli/dist/bin/cli.js run tests/api-collection.nouto.json \
            --env tests/environments.json \
            --env-name CI \
            --reporter-junit results.xml \
            --env-var "token=$API_TOKEN"

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: api-test-results
          path: results.xml
```

The workflow passes the secret through an environment variable instead of writing `${{ secrets.API_TOKEN }}` into the command, which keeps the token out of the generated script.

## GitLab CI

This job clones Nouto into `/tmp/nouto` and publishes the JUnit report to the merge request:

```yaml title=".gitlab-ci.yml"
api-tests:
  image: node:22
  stage: test
  script:
    - git clone --depth 1 https://github.com/frostybee/nouto.git /tmp/nouto
    - cd /tmp/nouto
    - corepack enable
    - pnpm install --frozen-lockfile --filter "@nouto/cli..."
    - pnpm run build:core
    - pnpm run build:cli
    - cd "$CI_PROJECT_DIR"
    - >
      node /tmp/nouto/packages/cli/dist/bin/cli.js run tests/api-collection.nouto.json
      --env tests/environments.json
      --env-name CI
      --reporter-junit results.xml
      --env-var "token=$API_TOKEN"
  artifacts:
    when: always
    reports:
      junit: results.xml
```

Define `API_TOKEN` as a masked CI/CD variable in the project settings.

## Jenkins

This declarative pipeline needs Node.js and Git on the agent, and the JUnit plugin to publish the report:

```groovy title="Jenkinsfile"
pipeline {
    agent any
    environment {
        API_TOKEN = credentials('api-token')
    }
    stages {
        stage('API tests') {
            steps {
                sh '''
                    git clone --depth 1 https://github.com/frostybee/nouto.git nouto
                    cd nouto
                    corepack enable
                    pnpm install --frozen-lockfile --filter "@nouto/cli..."
                    pnpm run build:core
                    pnpm run build:cli
                '''
                sh '''
                    node nouto/packages/cli/dist/bin/cli.js run tests/api-collection.nouto.json \
                        --env tests/environments.json \
                        --env-name CI \
                        --reporter-junit results.xml \
                        --env-var "token=$API_TOKEN"
                '''
            }
            post {
                always {
                    junit 'results.xml'
                }
            }
        }
    }
}
```

Store the token as a secret text credential with the ID `api-token`.

## Azure DevOps

This pipeline clones Nouto into the agent's temporary directory and publishes the report with the `PublishTestResults` task:

```yaml title="azure-pipelines.yml"
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '22.x'

  - script: |
      git clone --depth 1 https://github.com/frostybee/nouto.git $(Agent.TempDirectory)/nouto
      cd $(Agent.TempDirectory)/nouto
      corepack enable
      pnpm install --frozen-lockfile --filter "@nouto/cli..."
      pnpm run build:core
      pnpm run build:cli
    displayName: 'Build the Nouto CLI'

  - script: |
      node $(Agent.TempDirectory)/nouto/packages/cli/dist/bin/cli.js run tests/api-collection.nouto.json \
        --env tests/environments.json \
        --env-name CI \
        --reporter-junit $(Build.ArtifactStagingDirectory)/results.xml \
        --env-var "token=$(API_TOKEN)"
    displayName: 'Run API tests'

  - task: PublishTestResults@2
    condition: always()
    inputs:
      testResultsFormat: 'JUnit'
      testResultsFiles: '$(Build.ArtifactStagingDirectory)/results.xml'
```

Define `API_TOKEN` as a secret pipeline variable.

## Run with a data file

To run the collection once per row of a CSV file, pass the file with `--data` and set `--iterations 0`. Without `--iterations 0`, the CLI uses only the first row.

```bash
nouto run tests/api-collection.nouto.json \
  --data tests/users.csv \
  --iterations 0 \
  --reporter-junit results.xml
```

The JUnit report names each test case after the request and its iteration, for example `Create User [Iteration 2]`.

## Reports for CI

JUnit XML suits most CI servers. [Reports](/cli/run#reports) describes the JSON, HTML, and CSV formats and how to write several reports in one run.

The JUnit report records requests the runner skips, such as WebSocket and gRPC requests, as `<error>` test cases, and some CI servers count them as failures even though the CLI exits with `0`. Keep those requests out of the run with `--folder`, `--tags`, or `--exclude-tags`.
