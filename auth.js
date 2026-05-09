const USERS = [
  {
    username: "admin",
    password: "2414",
    role: "admin"
  },
  {
    username: "predi",
    password: "1234",
    role: "predi"
  },
  {
    username: "conductor",
    password: "2414",
    role: "conductor"
  }
];

// 🔐 LOGIN
function auth(req, res) {

  const { username, password } = req.body;

  const user = USERS.find(u =>
    u.username === username &&
    u.password === password
  );

  if (!user) {

    return res.json({
      ok: false
    });
  }

  res.json({
    ok: true,
    username: user.username,
    role: user.role
  });
}

// 🔒 LOGIN REQUERIDO
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

// 🛡 PERMISOS
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
  auth,
  requireLogin,
  requireRole
};

