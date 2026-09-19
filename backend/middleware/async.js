// Express 4 doesn't catch rejected promises from async handlers — forward them to next(err)
module.exports = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
