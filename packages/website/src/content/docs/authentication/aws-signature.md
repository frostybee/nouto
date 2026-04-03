---
title: AWS Signature v4
description: Sign requests to AWS services using AWS Signature Version 4 in Nouto.
---

AWS Signature Version 4 (SigV4) is required to authenticate requests to AWS services such as S3, DynamoDB, Lambda, API Gateway, and others. Nouto computes and attaches the signature automatically when you provide your credentials.

<!-- screenshot: authentication/aws-sigv4-fields.png -->
![AWS Signature v4 fields: Region, Service, Access Key ID, and Secret Access Key](/screenshots/authentication/aws-sigv4-fields.png)

## Setup

1. Open a request and click the **Auth** tab.
2. Select **AWS Signature v4** from the type dropdown.
3. Fill in the required fields:
   - **Access Key ID**: your AWS access key ID
   - **Secret Access Key**: your AWS secret access key
   - **AWS Region**: the region your service is in (e.g., `us-east-1`, `eu-west-2`)
   - **Service Name**: the AWS service identifier (e.g., `s3`, `execute-api`, `dynamodb`)
4. Optionally enter a **Session Token** if you are using temporary credentials from AWS STS.

## How It Works

SigV4 creates a signed hash of the request, including the method, URL, headers, and body. Nouto computes the signature and adds it to the `Authorization` header before sending:

```
Authorization: AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20240101/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-date, Signature=...
```

An `x-amz-date` header is also added with the current timestamp. If you provide a session token, Nouto adds the `x-amz-security-token` header as well.

## Service Names

AWS uses short identifiers for each service. Common values:

| Service | Service Name |
|---------|-------------|
| Amazon S3 | `s3` |
| Amazon DynamoDB | `dynamodb` |
| API Gateway (REST) | `execute-api` |
| Lambda | `lambda` |
| CloudWatch | `monitoring` |
| SQS | `sqs` |
| SNS | `sns` |
| Secrets Manager | `secretsmanager` |

Check the [AWS documentation](https://docs.aws.amazon.com/general/latest/gr/aws-service-information.html) for the service identifier of any service not listed here.

## Variable Support

All fields accept `{{variable}}` syntax:

| Field | Example |
|-------|---------|
| Access Key ID | `{{AWS_ACCESS_KEY_ID}}` |
| Secret Access Key | `{{AWS_SECRET_ACCESS_KEY}}` |
| Region | `{{AWS_REGION}}` |
| Service | `{{AWS_SERVICE}}` |
| Session Token | `{{AWS_SESSION_TOKEN}}` |

Store credentials in environment variables. Never hard-code AWS credentials directly in requests.

## Temporary Credentials (AWS STS)

When using IAM roles, AWS SSO, or `aws sts assume-role`, you receive a temporary Access Key ID, Secret Access Key, and Session Token. Enter all three fields. Temporary credentials expire, so refresh them in your environment variables when they rotate.

## IAM Permissions

The credentials you use must have IAM permissions for the specific API action you are calling. A `403 Forbidden` response from AWS usually means a missing permission, not a signing error. A `400 Bad Request` with a signature mismatch error indicates a configuration issue (wrong region, wrong service name, or mismatched credentials).
