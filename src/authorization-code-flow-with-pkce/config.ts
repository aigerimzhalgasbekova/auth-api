export const getRedirectUriAllowlist = (): string[] => {
    const allowlist = process.env.REDIRECT_URI_ALLOWLIST;
    if (!allowlist) {
        return [];
    }
    return allowlist.split(',').map((uri) => uri.trim());
};
