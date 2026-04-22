/**
 * GitHub File Service
 *
 * Persiste les fichiers markdown SAFe/proposals dans le repo git via l'API GitHub.
 * Complète les écritures fs locales (qui disparaissent au redéploiement Railway).
 *
 * Vars requises : GITHUB_TOKEN (fine-grained, scope contents:write), GITHUB_REPO ("owner/repo")
 * Var optionnelle : GITHUB_BRANCH (défaut : "main")
 */

import logger from '../config/logger';

interface GitHubContentsResponse {
  sha: string;
}

class GitHubService {
  private readonly token: string | undefined;
  private readonly repo: string | undefined;
  private readonly branch: string;
  readonly enabled: boolean;

  constructor() {
    this.token = process.env.GITHUB_TOKEN;
    this.repo = process.env.GITHUB_REPO || 'Tallec7/neopro';
    this.branch = process.env.GITHUB_BRANCH || 'main';
    this.enabled = !!this.token;
    if (!this.enabled) {
      logger.warn('GitHubService: GITHUB_TOKEN not set — proposal writes will not persist across Railway deploys');
    }
  }

  async writeFile(repoPath: string, content: string, commitMessage: string): Promise<void> {
    if (!this.enabled) return;

    const sha = await this.getFileSha(repoPath);
    const body: Record<string, unknown> = {
      message: commitMessage,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch: this.branch,
    };
    if (sha) body.sha = sha;

    const response = await fetch(
      `https://api.github.com/repos/${this.repo}/contents/${repoPath}`,
      {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`GitHub API ${response.status}: ${err}`);
    }
  }

  async deleteFile(repoPath: string, commitMessage: string): Promise<void> {
    if (!this.enabled) return;

    const sha = await this.getFileSha(repoPath);
    if (!sha) return;

    const response = await fetch(
      `https://api.github.com/repos/${this.repo}/contents/${repoPath}`,
      {
        method: 'DELETE',
        headers: this.headers(),
        body: JSON.stringify({ message: commitMessage, sha, branch: this.branch }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`GitHub API ${response.status}: ${err}`);
    }
  }

  async renameFile(oldRepoPath: string, newRepoPath: string, content: string, commitMessage: string): Promise<void> {
    if (!this.enabled) return;
    await this.writeFile(newRepoPath, content, commitMessage);
    await this.deleteFile(oldRepoPath, `chore(safe): remove renamed proposal file`);
  }

  private async getFileSha(repoPath: string): Promise<string | null> {
    const response = await fetch(
      `https://api.github.com/repos/${this.repo}/contents/${repoPath}?ref=${this.branch}`,
      { headers: this.headers() }
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub API ${response.status} on SHA lookup`);
    const data = await response.json() as GitHubContentsResponse;
    return data.sha;
  }

  private headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }
}

export const gitHubService = new GitHubService();
