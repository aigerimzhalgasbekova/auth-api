export const getValidatedCredentials = (headers) => {
    // Check if the Authorization header exists
    if (!headers || !headers['Authorization']) {
        return {
            valid: false,
            message: 'Invalid headers, Authorization header is missing',
        };
    }

    const authHeader = headers['Authorization'];

    // Check if the header starts with 'Basic'
    if (!authHeader.startsWith('Basic ')) {
        return {
            valid: false,
            message:
                'Invalid authorization scheme, expected Basic authentication',
        };
    }

    // Extract the base64 encoded part (separating from 'Basic ')
    const base64Credentials = authHeader.split(' ')[1];

    // Check if the credentials are present
    if (!base64Credentials) {
        return {
            valid: false,
            message: 'Credentials are missing in the Authorization header',
        };
    }
    // Regular expression to match valid Base64 characters
    const base64Regex = /^[A-Za-z0-9+/=]+$/;

    // Check if the string matches the Base64 format
    if (!base64Regex.test(base64Credentials)) {
        return {
            valid: false,
            message: 'Base64 string contains prohibited symbols',
        };
    }

    // Check for correct Base64 padding (Base64 strings should be divisible by 4)
    if (base64Credentials.length % 4 !== 0) {
        return {
            valid: false,
            message: 'Base64 string has incorrect padding',
        };
    }

    // Decode the base64 string
    const decodedCredentials = Buffer.from(
        base64Credentials,
        'base64',
    ).toString('utf-8');
    // Extract the username and password (they are separated by a colon)
    const [username, password] = decodedCredentials.split(':');

    // Validate username and password
    if (!username || !password) {
        return {
            valid: false,
            message:
                'Username or password is missing in the Authorization header',
        };
    }

    // Define regular expressions for allowed characters in username and password (depending on security policies)
    const usernameRegex = /^[a-zA-Z0-9_]+$/; // Alphanumeric and underscores are allowed in username
    const passwordRegex = /^[a-zA-Z0-9!@#$%^&*()_+=\-]+$/; // Alphanumeric and specific special characters allowed in password

    // Validate the username
    if (!usernameRegex.test(username)) {
        return {
            valid: false,
            message:
                'Username contains prohibited symbols. Only alphanumeric characters and underscores are allowed.',
        };
    }

    // Validate the password
    if (!passwordRegex.test(password)) {
        return {
            valid: false,
            message:
                'Password contains prohibited symbols. Only alphanumeric characters and !@#$%^&*()_+=- are allowed.',
        };
    }

    // If everything is valid, return the parsed username and password
    return {
        valid: true,
        username: username,
        password: password,
        message: 'Authorization header is valid',
    };
};
