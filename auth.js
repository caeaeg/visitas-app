function requireLogin(req, res, next) {

  const username = req.headers["x-user"];
  const role = req.headers["x-role"];

  if (!username || !role) {

    return res.status(401).json({
      error: "NO_AUTH"
    });
  }

  req.user = {
    username,
    role
  };

  next();
}

function requireRole(roles) {

  return (req, res, next) => {

    const role = req.user?.role;

    if (!roles.includes(role)) {

      return res.status(403).json({
        error: "NO_PERMISSION"
      });
    }

    next();
  };
}

module.exports = {
  requireLogin,
  requireRole
};

