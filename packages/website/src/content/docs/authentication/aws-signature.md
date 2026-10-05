---
title: AWS Signature v4
description: Sign requests to AWS services with AWS Signature Version 4 (SigV4) in Nouto.
sidebar:
  order: 5
---

AWS services such as S3, DynamoDB, Lambda, and API Gateway authenticate requests with AWS Signature Version 4 (SigV4). The AWS Sig V4 auth type computes the signature from your credentials and the request, and adds the signing headers when you send.

## Set up SigV4 signing

1. Open a request and select the **Auth** tab.
2. Select **AWS Sig V4** from the **Type** dropdown.
3. Enter the **Access Key** and **Secret Key**.
4. Select the **Region**. The dropdown lists common regions and defaults to `us-east-1`. For a region that isn't listed, select **Custom...** and type it.
5. Select the **Service**. The dropdown lists common services and defaults to `s3`. For a service that isn't listed, select **Custom...** and type its signing name.
6. If you use temporary credentials, enter the **Session Token**.

Nouto signs the request only when **Access Key** and **Secret Key** have values.

## Headers Nouto adds

Nouto hashes the method, URL, signed headers, and body, signs the result with your secret key, and adds these headers:

| Header | Value |
|--------|-------|
| `Authorization` | The `AWS4-HMAC-SHA256` credential, signed header list, and signature |
| `x-amz-date` | The signing time |
| `x-amz-content-sha256` | The SHA-256 hash of the request body |
| `x-amz-security-token` | The session token. Added only when **Session Token** has a value. |

The `Authorization` header looks like this:

```http
Authorization: AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20240101/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=...
```

:::caution
In the VS Code extension, Nouto signs the request before pre-request scripts run. A script that changes the URL, headers, or body invalidates the signature. The desktop app signs after pre-request scripts run.
:::

## Service signing names

The **Service** value is the service's signing name, which isn't always its display name:

| Service | Signing name |
|---------|--------------|
| Amazon S3 | `s3` |
| Amazon DynamoDB | `dynamodb` |
| Amazon API Gateway | `execute-api` |
| AWS Lambda | `lambda` |
| Amazon CloudWatch | `monitoring` |
| Amazon SQS | `sqs` |
| Amazon SNS | `sns` |
| AWS Secrets Manager | `secretsmanager` |

For CloudWatch, select **Custom...** and type `monitoring`. For other services, find the signing name in the [AWS service endpoints reference](https://docs.aws.amazon.com/general/latest/gr/aws-service-information.html).

## Temporary credentials

IAM roles, IAM Identity Center (AWS SSO), and `aws sts assume-role` issue temporary credentials: an access key, a secret key, and a session token. Enter all three. Temporary credentials expire, so replace them in Nouto when you get new ones.

## Field values and variables

The AWS Sig V4 fields don't resolve `{{variable}}` references. Nouto signs with the values exactly as typed.

**Secret Key** is masked, and **Access Key** and **Session Token** show their values. In the desktop app, the access key, secret key, and session token are stored in the operating system keychain. In the VS Code extension, they are saved as plain text with the collection.

## Signature and permission errors

The AWS error code in the response tells you whether the problem is the signature or the permissions:

- `SignatureDoesNotMatch` or `InvalidSignatureException` means AWS computed a different signature. Check the **Region**, the **Service** signing name, and the **Secret Key**.
- `ExpiredToken` or `ExpiredTokenException` means the temporary credentials have expired. Enter new ones.
- `AccessDenied` or `AccessDeniedException` means the signature is valid but the credentials lack IAM permission for the action.
