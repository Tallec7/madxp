import { execFileSync } from 'child_process';
import { piPasswordService } from './pi-password.service';

jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
}));

// execFileSync est mocké — on caste en jest.Mock pour éviter les surcharges complexes
const mockExecFileSync = execFileSync as jest.Mock;

describe('pi-password.service (ADR-132)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateHash — validation', () => {
    it('throws if password is too short (< 8 chars)', () => {
      expect(() => piPasswordService.generateHash('short')).toThrow(
        'Pi system password must be at least 8 characters'
      );
    });

    it('throws if password is too long (> 128 chars)', () => {
      expect(() => piPasswordService.generateHash('x'.repeat(129))).toThrow(
        'Pi system password must be at most 128 characters'
      );
    });

    it('throws if password is empty', () => {
      expect(() => piPasswordService.generateHash('')).toThrow(
        'Pi system password must be at least 8 characters'
      );
    });
  });

  describe('generateHash — openssl integration', () => {
    it('calls openssl passwd -6 -stdin with password via stdin', () => {
      const fakeHash = '$6$salt$hashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhashhash';
      mockExecFileSync.mockReturnValue(fakeHash);

      const result = piPasswordService.generateHash('validPassword123');

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'openssl',
        ['passwd', '-6', '-stdin'],
        expect.objectContaining({ input: 'validPassword123\n', encoding: 'utf8' })
      );
      expect(result).toBe(fakeHash);
    });

    it('returns the SHA-512-crypt hash starting with $6$', () => {
      const fakeHash = '$6$randomsalt$longhashvalue';
      mockExecFileSync.mockReturnValue(fakeHash);
      expect(piPasswordService.generateHash('Password1!')).toBe(fakeHash);
    });

    it('throws if openssl returns an unexpected format', () => {
      mockExecFileSync.mockReturnValue('$1$md5hash');
      expect(() => piPasswordService.generateHash('validPassword123')).toThrow(
        /unexpected format/
      );
    });

    it('throws a wrapped error if openssl fails', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('openssl: command not found');
      });
      expect(() => piPasswordService.generateHash('validPassword123')).toThrow(
        /Failed to generate SHA-512-crypt hash/
      );
    });

    it('never passes the password as a CLI argument (stdin only)', () => {
      const fakeHash = '$6$salt$hash';
      mockExecFileSync.mockReturnValue(fakeHash);

      piPasswordService.generateHash('mySecretPassword');

      const call = mockExecFileSync.mock.calls[0] as [string, string[], { input: string }];
      // args array (index 1) must NOT contain the password
      expect(call[1]).not.toContain('mySecretPassword');
      // password is in stdin (input option), not in the command args
      expect(call[2].input).toContain('mySecretPassword');
    });
  });
});
