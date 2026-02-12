module.exports = {
    apps: [{
        name: 'solmaalai-server',
        script: 'server/index.js',
        instances: 1,
        env: {
            NODE_ENV: 'production',
            PORT: 8000,
            ALLOWED_ORIGINS: 'https://DOMAIN_PLACEHOLDER',
        },
        max_memory_restart: '500M',
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }],
};
