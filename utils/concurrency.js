/**
 * Simple Concurrency Limiter
 * 
 * A lightweight p-limit alternative for controlling concurrent async operations.
 */

/**
 * Creates a concurrency limiter
 * @param {number} concurrency - Maximum number of concurrent operations
 * @returns {Function} Limiter function
 */
function createLimiter(concurrency) {
    if (concurrency < 1) {
        throw new Error('Concurrency must be at least 1');
    }

    let activeCount = 0;
    const queue = [];

    const next = () => {
        if (queue.length > 0 && activeCount < concurrency) {
            activeCount++;
            const { fn, resolve, reject } = queue.shift();
            fn().then(resolve).catch(reject).finally(() => {
                activeCount--;
                next();
            });
        }
    };

    /**
     * Runs an async function with concurrency limiting
     * @param {Function} fn - Async function to run
     * @returns {Promise} Result of the function
     */
    const limit = (fn) => {
        return new Promise((resolve, reject) => {
            queue.push({ fn, resolve, reject });
            next();
        });
    };

    /**
     * Returns the number of currently active operations
     */
    limit.activeCount = () => activeCount;

    /**
     * Returns the number of pending operations in queue
     */
    limit.pendingCount = () => queue.length;

    return limit;
}

/**
 * Processes items with concurrency control
 * @param {Array} items - Items to process
 * @param {Function} processor - Async function to process each item
 * @param {number} [concurrency=10] - Max concurrent operations
 * @returns {Promise<Array>} Array of results with status
 */
async function processWithConcurrency(items, processor, concurrency = 3) {
    const limit = createLimiter(concurrency);
    
    const results = await Promise.all(
        items.map((item, index) => 
            limit(async () => {
                try {
                    const result = await processor(item, index);
                    return {
                        success: true,
                        item: item,
                        result: result
                    };
                } catch (error) {
                    console.log(error)
                    return {
                        success: false,
                        item: item,
                        error: error
                    };
                }
            })
        )
    );

    return results;
}

module.exports = {
    createLimiter,
    processWithConcurrency
};




