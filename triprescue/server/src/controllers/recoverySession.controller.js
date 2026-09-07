const RecoverySession = require('../models/RecoverySession');

const getRecoverySessionById = async (req, res, next) => {
  try {
    const session = await RecoverySession.findById(req.params.id).populate('tripId');
    if (!session) {
      const error = new Error('Recovery session not found');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }
    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRecoverySessionById,
};
