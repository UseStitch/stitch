class McpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpError';
  }
}

export class McpOAuthMissingVerifierError extends McpError {
  constructor() {
    super('No PKCE code verifier saved for MCP OAuth session');
    this.name = 'McpOAuthMissingVerifierError';
  }
}
