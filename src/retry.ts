interface ILogger {
    error: (message: string) => void;
    warn: (message: string) => void;
    info: (message: string) => void;
}

export function retry(callback: () => Promise<any>, retries = 5, delay = 500, logger: ILogger | null = null) {
    return new Promise((resolve, reject) => {
        callback().then(resolve).catch((err) => {
            if (err instanceof Error) {
                logger?.warn(`❌ Try failed: ${err.message}`)
            } else {
                logger?.warn("❌ Try failed: Unknown error")
            }
            if (retries === 0) {
                if (err instanceof Error) {
                    logger?.error(`💥 Fatal failure: ${err.message}`)
                } else {
                    logger?.error("💥 Fatal failure: Unknown error")
                }
                reject(err)
            } else {
                let jitter = delay * 0.5 * Math.random(); // adding jitter
                const nextDelay = delay + jitter
                logger?.info(`🔄 Retrying in ${nextDelay.toFixed(0)}ms, ${retries} attempts left`)
                setTimeout(() => {
                    retry(callback, retries - 1, delay * 2, logger).then(resolve).catch(reject)
                }, nextDelay)
            }
        })
    })
}