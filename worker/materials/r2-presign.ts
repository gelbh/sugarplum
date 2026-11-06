import { AwsClient } from "aws4fetch";

const DEFAULT_EXPIRES_SEC = 3600;

/** Presigned PUT URL for direct browser upload to R2 (S3-compatible). */
export async function createR2PutUrl(opts: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  contentType: string;
  /** Bound into the signature so oversized PUTs fail auth. */
  contentLength: number;
  expiresIn?: number;
}): Promise<string> {
  const expiresIn = opts.expiresIn ?? DEFAULT_EXPIRES_SEC;
  const client = new AwsClient({
    accessKeyId: opts.accessKeyId,
    secretAccessKey: opts.secretAccessKey,
    service: "s3",
    region: "auto",
  });

  const url = new URL(
    `https://${opts.accountId}.r2.cloudflarestorage.com/${opts.bucket}/${opts.key}`,
  );
  url.searchParams.set("X-Amz-Expires", String(expiresIn));

  const signed = await client.sign(
    new Request(url, {
      method: "PUT",
      headers: {
        "Content-Type": opts.contentType,
        "Content-Length": String(opts.contentLength),
      },
    }),
    { aws: { signQuery: true } },
  );

  return signed.url;
}

export async function createR2GetUrl(opts: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  key: string;
  expiresIn?: number;
}): Promise<string> {
  const expiresIn = opts.expiresIn ?? DEFAULT_EXPIRES_SEC;
  const client = new AwsClient({
    accessKeyId: opts.accessKeyId,
    secretAccessKey: opts.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const url = new URL(
    `https://${opts.accountId}.r2.cloudflarestorage.com/${opts.bucket}/${opts.key}`,
  );
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  const signed = await client.sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true },
  });
  return signed.url;
}
