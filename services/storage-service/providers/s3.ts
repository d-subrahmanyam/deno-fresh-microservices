import { DownloadResult, StorageProvider, UploadResult } from "./mod.ts";

// AWS S3 Storage Provider
//
// To activate this provider:
//   1. Add the AWS SDK to your import map or deno.json:
//        import "npm:@aws-sdk/client-s3@^3"
//   2. Set the following environment variables:
//        AWS_BUCKET          — S3 bucket name (must already exist)
//        AWS_REGION          — e.g. "us-east-1"
//        AWS_ACCESS_KEY_ID   — IAM access key
//        AWS_SECRET_ACCESS_KEY — IAM secret key
//   3. Change STORAGE_PROVIDER=s3 in docker-compose.yml (or your cloud env)
//
// File URLs will have the form:
//   https://{AWS_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{key}
//
// Required S3 bucket policy (object-level public read):
//   { "Effect": "Allow", "Principal": "*", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::{bucket}/*" }

export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  private bucket: string;
  private region: string;
  private publicUrl: string;

  constructor() {
    this.bucket = Deno.env.get("AWS_BUCKET") || "";
    this.region = Deno.env.get("AWS_REGION") || "us-east-1";
    this.publicUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com`;
  }

  async upload(_key: string, _data: Uint8Array, _contentType: string): Promise<UploadResult> {
    // TODO: implement with @aws-sdk/client-s3
    //
    // import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";
    // const client = new S3Client({ region: this.region });
    // await client.send(new PutObjectCommand({
    //   Bucket: this.bucket, Key: _key, Body: _data, ContentType: _contentType,
    // }));
    // return { key: _key, url: this.getUrl(_key), size: _data.byteLength, contentType: _contentType };
    throw new Error(
      "S3StorageProvider: not yet implemented. See providers/s3.ts for activation steps.",
    );
  }

  async download(_key: string): Promise<DownloadResult | null> {
    // TODO: implement with GetObjectCommand
    throw new Error(
      "S3StorageProvider: not yet implemented. See providers/s3.ts for activation steps.",
    );
  }

  async delete(_key: string): Promise<void> {
    // TODO: implement with DeleteObjectCommand
    throw new Error(
      "S3StorageProvider: not yet implemented. See providers/s3.ts for activation steps.",
    );
  }

  getUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }

  async isHealthy(): Promise<boolean> {
    // TODO: implement HeadBucket check once the SDK is wired up
    return true;
  }
}
