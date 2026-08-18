---
title: "CLI: CI/CD Integration"
description: Integrate Nouto CLI into GitHub Actions, GitLab CI, Jenkins, and Azure DevOps pipelines.
sidebar:
  order: 5
---

The Nouto CLI integrates into CI/CD pipelines to run API tests as part of your build process. Use JUnit XML output for test result reporting and exit codes for pass/fail gates.

## GitHub Actions

```yaml
name: API Tests
on: [push, pull_request]

jobs:
  api-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Nouto CLI
        run: |
          corepack enable
          pnpm install --frozen-lockfile
          pnpm run build:cli

      - name: Run API tests
        run: |
          node packages/cli/dist/bin/cli.js run tests/api-collection.nouto.json \
            --env tests/environments.json \
            --env-name CI \
            --env-var token=${{ secrets.API_TOKEN }} \
            --reporter-junit results.xml \
            --reporter-json results.json \
            --stop-on-failure

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: api-test-results
          path: |
            results.xml
            results.json
```

## GitLab CI

```yaml
api-tests:
  image: node:20
  stage: test
  script:
    - corepack enable
    - pnpm install --frozen-lockfile
    - pnpm run build:cli
    - node packages/cli/dist/bin/cli.js run tests/api-collection.nouto.json
        --env tests/environments.json
        --env-name CI
        --env-var token=$API_TOKEN
        --reporter-junit results.xml
  artifacts:
    when: always
    reports:
      junit: results.xml
```

## Jenkins

```groovy
pipeline {
    agent any
    stages {
        stage('API Tests') {
            steps {
                sh 'corepack enable && pnpm install --frozen-lockfile && pnpm run build:cli'
                sh '''
                    node packages/cli/dist/bin/cli.js run tests/api-collection.nouto.json \
                        --env tests/environments.json \
                        --env-name CI \
                        --env-var token=${API_TOKEN} \
                        --reporter-junit results.xml
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

## Azure DevOps

```yaml
trigger:
  - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'

  - script: corepack enable && pnpm install --frozen-lockfile && pnpm run build:cli
    displayName: 'Build Nouto CLI'

  - script: |
      node packages/cli/dist/bin/cli.js run tests/api-collection.nouto.json \
        --env tests/environments.json \
        --env-name CI \
        --env-var token=$(API_TOKEN) \
        --reporter-junit $(Build.ArtifactStagingDirectory)/results.xml
    displayName: 'Run API tests'

  - task: PublishTestResults@2
    condition: always()
    inputs:
      testResultsFormat: 'JUnit'
      testResultsFiles: '$(Build.ArtifactStagingDirectory)/results.xml'
```

## Exit Codes

Use exit codes to control pipeline behavior:

| Code | Meaning | CI Action |
|------|---------|-----------|
| `0` | All passed | Continue |
| `1` | Test failures | Fail the build |
| `2` | File not found | Fail (config error) |
| `3` | Environment not found | Fail (config error) |
| `4` | Invalid collection | Fail (config error) |
| `7` | Other error | Fail |

## Environment Variables in CI

Pass secrets from your CI environment using `--env-var`:

```bash
node packages/cli/dist/bin/cli.js run collection.nouto.json \
  --env-var apiKey=${{ secrets.API_KEY }} \
  --env-var baseUrl=${{ vars.API_BASE_URL }}
```

Or use a `.env` file checked into the repo (without secrets):

```bash
node packages/cli/dist/bin/cli.js run collection.nouto.json --env-file ci.env
```

## Data-Driven Testing in CI

Run tests with a CSV data file for parameterized tests:

```bash
node packages/cli/dist/bin/cli.js run collection.nouto.json \
  --data test-users.csv \
  --iterations 0 \
  --reporter-junit results.xml
```

Use `--iterations 0` to iterate over all rows in the data file.

## Multiple Reports

Generate multiple report formats in a single run:

```bash
node packages/cli/dist/bin/cli.js run collection.nouto.json \
  --reporter-junit results.xml \
  --reporter-json results.json \
  --reporter-html report.html
```
