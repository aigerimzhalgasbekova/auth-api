import { hashPassword, verifyPassword } from '../../password';

describe('password utilities', () => {
    it('should hash a password and verify it correctly', async () => {
        const password = 'my-secret-password';
        const hash = await hashPassword(password);
        expect(hash).not.toBe(password);
        expect(await verifyPassword(password, hash)).toBe(true);
    });

    it('should reject incorrect password', async () => {
        const hash = await hashPassword('correct-password');
        expect(await verifyPassword('wrong-password', hash)).toBe(false);
    });

    it('should produce different hashes for same password (salt)', async () => {
        const password = 'my-secret-password';
        const hash1 = await hashPassword(password);
        const hash2 = await hashPassword(password);
        expect(hash1).not.toBe(hash2);
    });
});
