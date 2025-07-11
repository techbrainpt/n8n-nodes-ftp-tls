import {
	IAuthenticateGeneric,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FtpTls implements ICredentialType {
	name = 'ftpTls';
	displayName = 'FTP/FTPS with TLS';
	documentationUrl = 'ftp';
	properties: INodeProperties[] = [
		{
			displayName: 'Host',
			name: 'host',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'number',
			default: 21,
			required: true,
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
		},
		{
			displayName: 'Protocol',
			name: 'protocol',
			type: 'options',
			options: [
				{
					name: 'FTP',
					value: 'ftp',
				},
				{
					name: 'FTPS (Explicit)',
					value: 'ftps-explicit',
				},
				{
					name: 'FTPS (Implicit)',
					value: 'ftps-implicit',
				},
				{
					name: 'SFTP',
					value: 'sftp',
				},
			],
			default: 'ftp',
		},
		{
			displayName: 'Security',
			name: 'security',
			type: 'options',
			displayOptions: {
				show: {
					protocol: ['ftps-explicit', 'ftps-implicit'],
				},
			},
			options: [
				{
					name: 'Strict',
					value: 'strict',
				},
				{
					name: 'Legacy',
					value: 'legacy',
				},
			],
			default: 'strict',
			description: 'How to deal with security',
		},
		{
			displayName: 'Ignore SSL Issues',
			name: 'ignoreSSLIssues',
			type: 'boolean',
			displayOptions: {
				show: {
					protocol: ['ftps-explicit', 'ftps-implicit'],
				},
			},
			default: false,
			description: 'Whether to ignore SSL certificate errors',
		},
		{
			displayName: 'Private Key',
			name: 'privateKey',
			type: 'string',
			displayOptions: {
				show: {
					protocol: ['sftp'],
				},
			},
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'Private key for SFTP authentication',
		},
		{
			displayName: 'Passphrase',
			name: 'passphrase',
			type: 'string',
			displayOptions: {
				show: {
					protocol: ['sftp'],
				},
			},
			typeOptions: {
				password: true,
			},
			default: '',
			description: 'Passphrase for private key',
		},
		{
			displayName: 'Timeout',
			name: 'timeout',
			type: 'number',
			default: 10000,
			description: 'Connection timeout in milliseconds',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {},
	};

	// Test is handled by the node itself, not via HTTP request
}