import { Bucket$, DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';


const bucketText = 'avatars';

@Injectable()
export class MinioService {
	private client: S3Client;

	constructor() {
		this.client = new S3Client({
			region: 'us-east-1',
			endpoint: 'http://localhost:9000',
			credentials: {
				accessKeyId: 'difsel',
				secretAccessKey: 'difsel123456'
			},
			forcePathStyle: true
		});
	}

	async uploadFile(key: string, file: Buffer, mimetype: string){
		const command = new PutObjectCommand({
			Bucket: bucketText,
			Key: key,
			Body: file,
			ContentType: mimetype
		})

		await this.client.send(command);
	}

	async getFile(key: string) {
		const command = new GetObjectCommand({
			Bucket: bucketText,
			Key: key
		});
		const response = await this.client.send(command);
		return response.Body;
	}

	async deleteFile(key: string) {
		const command = new DeleteObjectCommand({
			Bucket: bucketText,
			Key: key
		});

		await this.client.send(command);
	}

	async getPresignedUrl(key: string){
		const command = new GetObjectCommand({
			Bucket: bucketText,
			Key: key
		})

		const url = await getSignedUrl(this.client, command, {expiresIn: 1 * 60 * 1000})
		return url;
	}
}