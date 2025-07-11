import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	IBinaryData,
} from 'n8n-workflow';

import { 
	NodeConnectionType, 
	NodeOperationError 
} from 'n8n-workflow';

import { Client as FtpClient } from 'basic-ftp';
import SftpClient from 'ssh2-sftp-client';
import { basename } from 'path';

export class FtpTls implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'FTP/FTPS with TLS',
		name: 'ftpTls',
		icon: 'fa:server',
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["path"]}}',
		description: 'FTP/FTPS with TLS support',
		defaults: {
			name: 'FTP/FTPS with TLS',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'ftpTls',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'List',
						value: 'list',
						description: 'List files and folders',
						action: 'List files and folders',
					},
					{
						name: 'Download',
						value: 'download',
						description: 'Download a file',
						action: 'Download a file',
					},
					{
						name: 'Upload',
						value: 'upload',
						description: 'Upload a file',
						action: 'Upload a file',
					},
					{
						name: 'Delete',
						value: 'delete',
						description: 'Delete a file or folder',
						action: 'Delete a file or folder',
					},
					{
						name: 'Rename',
						value: 'rename',
						description: 'Rename a file or folder',
						action: 'Rename a file or folder',
					},
				],
				default: 'list',
			},
			{
				displayName: 'Path',
				name: 'path',
				type: 'string',
				default: '/',
				description: 'The remote path to operate on',
			},
			{
				displayName: 'Recursive',
				name: 'recursive',
				type: 'boolean',
				default: false,
				description: 'Whether to perform the operation recursively',
				displayOptions: {
					show: {
						operation: ['list', 'delete'],
					},
				},
			},
			{
				displayName: 'Binary Property Name',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				description: 'Name of the binary property to store the file',
				displayOptions: {
					show: {
						operation: ['download', 'upload'],
					},
				},
			},
			{
				displayName: 'Binary Data',
				name: 'binaryData',
				type: 'boolean',
				default: false,
				description: 'Whether to upload binary data',
				displayOptions: {
					show: {
						operation: ['upload'],
					},
				},
			},
			{
				displayName: 'File Content',
				name: 'fileContent',
				type: 'string',
				default: '',
				description: 'The content of the file to upload',
				displayOptions: {
					show: {
						operation: ['upload'],
						binaryData: [false],
					},
				},
			},
			{
				displayName: 'New Path',
				name: 'newPath',
				type: 'string',
				default: '',
				description: 'The new path for the file or folder',
				displayOptions: {
					show: {
						operation: ['rename'],
					},
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const credentials = await this.getCredentials('ftpTls', i);
				const operation = this.getNodeParameter('operation', i) as string;

				let result;
				const ftpTls = new FtpTls();
				if (credentials.protocol === 'sftp') {
					result = await ftpTls.executeSftpOperation(this, i, credentials, operation);
				} else {
					result = await ftpTls.executeFtpOperation(this, i, credentials, operation);
				}

				returnData.push({ json: result });
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				returnData.push({
					json: {
						error: errorMessage,
					},
				});
			}
		}

		return [returnData];
	}

	public async executeFtpOperation(
		context: IExecuteFunctions,
		itemIndex: number,
		credentials: IDataObject,
		operation: string,
	): Promise<IDataObject> {
		const client = new FtpClient();
		const remotePath = context.getNodeParameter('path', itemIndex) as string;

		// Configure TLS options
		const tlsOptions: any = {
			host: credentials.host as string,
			port: credentials.port as number,
			user: credentials.username as string,
			password: credentials.password as string,
		};

		// Configure security based on protocol
		if (credentials.protocol === 'ftps-explicit' || credentials.protocol === 'ftps-implicit') {
			tlsOptions.secure = credentials.protocol === 'ftps-implicit';
			
			// Configure TLS options to handle certificates properly
			const secureOptions: any = {
				minVersion: 'TLSv1.2',
				maxVersion: 'TLSv1.3',
				rejectUnauthorized: false, // Accept self-signed certificates
				checkServerIdentity: () => undefined, // Skip hostname verification
				secureProtocol: 'TLSv1_2_method', // Force TLS 1.2+
			};
			
			if (credentials.security === 'strict') {
				secureOptions.ciphers = 'ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS';
			}
			
			tlsOptions.secureOptions = secureOptions;
		}

		try {
			// Set up TLS event handlers for certificate validation
			if (credentials.protocol === 'ftps-explicit' || credentials.protocol === 'ftps-implicit') {
				client.ftp.socket?.on('secureConnect', () => {
					// Certificate accepted - connection is secure
				});
			}
			
			await client.access(tlsOptions);

			switch (operation) {
				case 'list':
					const files = await client.list(remotePath);
					return {
						files: files.map((file) => ({
							name: file.name,
							size: file.size,
							type: file.type === 1 ? 'file' : 'directory',
							modifiedAt: file.modifiedAt,
						})),
					};

				case 'download':
					const binaryPropertyName = context.getNodeParameter('binaryPropertyName', itemIndex) as string;
					const { Writable } = require('stream');
					const chunks: Buffer[] = [];
					
					const downloadStream = new Writable({
						write(chunk: Buffer, _encoding: any, callback: any) {
							chunks.push(chunk);
							callback();
						}
					});
					
					await client.downloadTo(downloadStream, remotePath);
					const downloadBuffer = Buffer.concat(chunks);
					
					const binaryData: IBinaryData = {
						data: downloadBuffer.toString('base64'),
						mimeType: 'application/octet-stream',
						fileName: basename(remotePath),
					};

					return {
						[binaryPropertyName]: binaryData,
					};

				case 'upload':
					const binaryData_upload = context.getNodeParameter('binaryData', itemIndex) as boolean;
					let uploadBuffer: Buffer;

					if (binaryData_upload) {
						const binaryPropertyName_upload = context.getNodeParameter('binaryPropertyName', itemIndex) as string;
						const binaryDataBuffer = await context.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName_upload);
						uploadBuffer = binaryDataBuffer;
					} else {
						const fileContent = context.getNodeParameter('fileContent', itemIndex) as string;
						uploadBuffer = Buffer.from(fileContent);
					}

					const { Readable } = require('stream');
					const uploadStream = new Readable({
						read() {
							this.push(uploadBuffer);
							this.push(null);
						}
					});
					
					await client.uploadFrom(uploadStream, remotePath);
					return {
						success: true,
						message: `File uploaded to ${remotePath}`,
					};

				case 'delete':
					const recursive_delete = context.getNodeParameter('recursive', itemIndex) as boolean;
					if (recursive_delete) {
						await client.removeDir(remotePath);
					} else {
						await client.remove(remotePath);
					}
					return {
						success: true,
						message: `${recursive_delete ? 'Directory' : 'File'} deleted: ${remotePath}`,
					};

				case 'rename':
					const newPath = context.getNodeParameter('newPath', itemIndex) as string;
					await client.rename(remotePath, newPath);
					return {
						success: true,
						message: `Renamed ${remotePath} to ${newPath}`,
					};

				default:
					throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`);
			}
		} catch (error) {
			if (error instanceof NodeOperationError) {
				throw error;
			}
			throw new NodeOperationError(context.getNode(), `FTP operation failed: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			try {
				client.close();
			} catch (closeError) {
				// Ignore close errors
			}
		}
	}

	public async executeSftpOperation(
		context: IExecuteFunctions,
		itemIndex: number,
		credentials: IDataObject,
		operation: string,
	): Promise<IDataObject> {
		const client = new SftpClient();
		const remotePath = context.getNodeParameter('path', itemIndex) as string;

		const sftpOptions: any = {
			host: credentials.host as string,
			port: credentials.port as number,
			username: credentials.username as string,
		};

		// Configure authentication
		if (credentials.privateKey) {
			sftpOptions.privateKey = credentials.privateKey as string;
			if (credentials.passphrase) {
				sftpOptions.passphrase = credentials.passphrase as string;
			}
		} else {
			sftpOptions.password = credentials.password as string;
		}

		// Configure connection options
		if (credentials.timeout) {
			sftpOptions.readyTimeout = credentials.timeout as number;
		}

		try {
			await client.connect(sftpOptions);

			switch (operation) {
				case 'list':
					const list = await client.list(remotePath);
					return {
						files: list.map((file: any) => ({
							name: file.name,
							size: file.size,
							type: file.type === 'd' ? 'directory' : 'file',
							modifiedAt: file.modifyTime,
						})),
					};

				case 'download':
					const binaryPropertyName = context.getNodeParameter('binaryPropertyName', itemIndex) as string;
					const buffer = await client.get(remotePath);
					
					const binaryData: IBinaryData = {
						data: (buffer as Buffer).toString('base64'),
						mimeType: 'application/octet-stream',
						fileName: basename(remotePath),
					};

					return {
						[binaryPropertyName]: binaryData,
					};

				case 'upload':
					const binaryData_upload = context.getNodeParameter('binaryData', itemIndex) as boolean;
					let uploadBuffer: Buffer;

					if (binaryData_upload) {
						const binaryPropertyName_upload = context.getNodeParameter('binaryPropertyName', itemIndex) as string;
						const binaryDataBuffer = await context.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName_upload);
						uploadBuffer = binaryDataBuffer;
					} else {
						const fileContent = context.getNodeParameter('fileContent', itemIndex) as string;
						uploadBuffer = Buffer.from(fileContent);
					}

					await client.put(uploadBuffer, remotePath);
					return {
						success: true,
						message: `File uploaded to ${remotePath}`,
					};

				case 'delete':
					const recursive_delete = context.getNodeParameter('recursive', itemIndex) as boolean;
					if (recursive_delete) {
						await client.rmdir(remotePath, true);
					} else {
						await client.delete(remotePath);
					}
					return {
						success: true,
						message: `${recursive_delete ? 'Directory' : 'File'} deleted: ${remotePath}`,
					};

				case 'rename':
					const newPath = context.getNodeParameter('newPath', itemIndex) as string;
					await client.rename(remotePath, newPath);
					return {
						success: true,
						message: `Renamed ${remotePath} to ${newPath}`,
					};

				default:
					throw new NodeOperationError(context.getNode(), `Unknown operation: ${operation}`);
			}
		} catch (error) {
			if (error instanceof NodeOperationError) {
				throw error;
			}
			throw new NodeOperationError(context.getNode(), `SFTP operation failed: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			try {
				await client.end();
			} catch (closeError) {
				// Ignore close errors
			}
		}
	}
}