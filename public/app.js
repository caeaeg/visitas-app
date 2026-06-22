// =========================================================================
// 🚀 PARTE 1: CONFIGURACIÓN ESTRUCTURAL, ESTADOS GLOBALES Y ENRUTADOR DE VISTAS
// =========================================================================

/**
 * 1. CONFIGURACIÓN COMPORTAMENTAL DEL ENTORNO DE RED
 * Establece el punto de enlace base por defecto alineado con el despliegue central.
 */
const API_BASE_URL = "https://visitas-app-inxa.onrender.com"; 

/**
 * 2. CONTROL DE SESIÓN Y VARIABLES DE ENTORNO EN TIEMPO REAL
 * Variables globales mandatorias compartidas por los módulos de autenticación y lógica.
 */
let currentUser = localStorage.getItem("username") || localStorage.getItem("user") || "";
let currentRole = localStorage.getItem("role") || "";
let paginaActual = 1;
const ELEMENTOS_POR_PAGINA = 10;

/**
 * 3. REFERENCIAS Y NÚCLEO GEOGRÁFICO (LEAFLET)
 * Instancias de control para el despliegue, marcadores y agrupamientos de mapas.
 */
let leafletMap = null;          // Instancia transaccional utilizada en el formulario de edición
let leafletMarker = null;       // Marcador arrastrable (Draggable) del formulario de edición
let map = null;                 // Instancia del mapa principal del panel administrativo
let prediMiniMap = null;        // Instancia del mapa opcional adaptado a la visualización móvil
let markerClusterGroup = null;  // Contenedor lógico para el empaquetado de marcadores masivos anterior
let mapaGeneral = null;         // ✨ Instancia maestra unificada del mapa (Admin / General)
let marcadoresClusterGlobal = null; // ✨ Grupo de clústeres dinámicos translúcidos Dark Mode

/** * 4. ESTRATOS DE PERSISTENCIA Y FLUJO EN MEMORIA VOLÁTIL
 * Buffers e índices globales compartidos por el motor de relevamiento y paneles. */
window.todosLosEdificiosDB = [];       // Pool central de sincronización de la base de datos
window.baseDatosEdificiosMemoria = []; // Caché unificado para roles de administración y conducción
window.edificiosEncontrados = [];      // Resultados temporales del motor de búsqueda predictiva
window.indiceEdificioActual = 0;       // Índice activo del carrusel en el visor móvil del predi
window.currentBuildingId = null;       // Identificador transaccional del edificio en foco operativo
window.edificioActivo = null;          // Objeto completo del edificio cargado en la sesión de campo
window.departamentoEnFoco = null;      // Estructura relacional del departamento bajo análisis ({ _id, number })

// Controladores avanzados de sincronización visual (Compatibilidad de ventanas y sub-mapas)
let miTemporizadorMapa = null;         // ✨ Declaración limpia para el delay de redimensionamiento (InvalidateSize)
let miniMapaAdminInstance = null;      // ✨ Instancia aislada limpia para previsualizaciones secundarias

// Estados específicos asignados al subsistema SuperAdmin
window.superAdminAutenticado = false;
window.superAdminPaginaActual = 1;
window.superAdminFiltrados = [];

/** * 5. CAPTURA DINÁMICA BLINDADA DEL DOM
 * Acceso seguro a componentes del visor de campo. Evita inicializaciones nulas prematuras. */
const UI = {
  get resultado() { return document.getElementById("resultado"); },
  get infoEdificio() { return document.getElementById("infoEdificio"); },
  get nota() { return document.getElementById("nota"); },
  get btnOk() { return document.getElementById("btnOk"); },
  get btnNo() { return document.getElementById("btnNo"); },
  get btnSiguiente() { return document.getElementById("btnSiguiente"); },
  get btnNuevoEdificio() { return document.getElementById("btnNuevoEdificio"); },
  get reportBtn() { return document.getElementById("reportBtn"); },
  get loadingBar() { return document.getElementById("loadingBar"); }
};

// =========================================================================
// 🔐 SECTOR: CONTROL DE ACCESO, COMUNICACIÓN CENTRALIZADA Y CONTROL DE VISTAS
// =========================================================================

/**
 * 1. ENVOLTURA DE COMUNICACIÓN SEGURA (API FETCH INTEGRADO)
 * Centraliza las peticiones al backend resolviendo URL base, headers automáticos de rol,
 * manejo visual de barras de progreso y ruteo forzado por expiración de credenciales.
 */
async function apiFetch(endpoint, options = {}) {
  const username = localStorage.getItem('username') || localStorage.getItem('user');
  const role = localStorage.getItem('role');
  
  if (username) currentUser = username;
  if (role) currentRole = role;
  
  const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://visitas-app-inxa.onrender.com';

  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  options.headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (username && role) {
    options.headers['x-user'] = username;
    options.headers['x-role'] = role;
  }

  const lBar = document.getElementById("loadingBar");
  if (lBar) lBar.style.width = "30%";

  try {
    const response = await fetch(url, options);
    
    if (lBar) lBar.style.width = "100%";
    setTimeout(() => { 
      if (lBar) lBar.style.width = "0%"; 
    }, 400);

    if (response.status === 401 || response.status === 403) {
      console.warn("🔐 Credenciales inválidas o sin permisos. Redireccionando...");
      logout();
      return response;
    }

    return response;
  } catch (error) {
    if (lBar) lBar.style.width = "0%";
    console.error("❌ Error físico de red en apiFetch:", error);
    throw error;
  }
}

/**
 * 2. ESTRUCTURADOR DE CABECERAS
 */
function obtenerHeadersSeguros() {
  return {
    "Content-Type": "application/json",
    "x-user": localStorage.getItem("username") || localStorage.getItem("user") || "",
    "x-role": localStorage.getItem("role") || ""
  };
}

/**
 * 3. CONTROLADOR VISUAL DE ESPERA (SPINNER)
 */
function mostrarLoading(mostrar) {
  const spinner = document.getElementById("loading") || document.getElementById("loadingSpinner");
  if (spinner) {
    spinner.style.display = mostrar ? "flex" : "none";
  } else {
    document.body.style.cursor = mostrar ? "wait" : "default";
  }
}

/**
 * 4. PROCESADOR DE LOGEO CENTRAL
 */
async function login() {
  const userField = document.getElementById("loginUser");
  const passField = document.getElementById("loginPass");
  const msgLabel = document.getElementById("loginMsg");

  const user = userField?.value.trim();
  const pass = passField?.value.trim();

  if (!user || !pass) {
    
    mostrarAviso("Por favor complete todos los campos obligatorios.", "warning");
    if (msgLabel) msgLabel.innerText = "Campos incompletos.";
    return;
  }

  mostrarLoading(true);
  if (msgLabel) msgLabel.innerText = "";

  const baseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://visitas-app-inxa.onrender.com';

  try {
    const respuesta = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass })
    });

    if (!respuesta.ok) {
      const errData = await respuesta.json().catch(() => ({}));
      throw new Error(errData.message || "Credenciales incorrectas");
    }

    const datos = await respuesta.json();
    
    if (datos.ok === false || !datos.ok) {
      throw new Error("Usuario o contraseña incorrectos");
    }

    localStorage.setItem("username", datos.username);
    localStorage.setItem("user", datos.username);
    localStorage.setItem("role", datos.role);
    
    currentUser = datos.username;
    currentRole = datos.role;

    console.log(`🔑 Sesión iniciada con éxito. Usuario: ${currentUser}, Rol: ${currentRole}`);
    
    await iniciarAppConPermisos();

  } catch (error) {
    console.error("Fallo de autenticación:", error);
    if (msgLabel) {
      msgLabel.innerText = error.message === "Failed to fetch" 
        ? "❌ Sin conexión con el servidor." 
        : `❌ ${error.message}`;
    } else {
     
      mostrarAviso(`Error: ${error.message}`, "error");
    }
  } finally {
    mostrarLoading(false);
  }
}

/** * 🔒 FUNCIÓN DE SEGURIDAD AUXILIAR (Filtra elementos críticos en el Dashboard) */
function aplicarFiltrosVisualesPorRol() {
  const userRole = localStorage.getItem("role") || currentRole;
  
  // 🔍 Intentamos buscar la tarjeta por sus posibles selectores (ID o atributo onclick)
  const botonSuperAdmin = document.getElementById("btnSuperAdminMenu") 
    || document.getElementById("escudoSuperAdmin")
    || document.querySelector('[onclick*="superAdminView"]');

  if (botonSuperAdmin) {
    if (userRole === "admin" || userRole === "superadmin") {
      // Si es Admin total, se muestra impecable
      botonSuperAdmin.style.display = "flex"; 
    } else {
      // 🛡️ Si es Conductor o Predi, se extirpa físicamente de la pantalla
      botonSuperAdmin.style.display = "none"; 
    }
  }
}

/** * 5. ORQUESTADOR DE ENTORNO SEGÚN PERMISOS Y ROLES DE TRABAJO */
async function iniciarAppConPermisos() {
  const elLogin = document.getElementById("loginScreen");
  const badge = document.getElementById("badge-rol-usuario");
  const escudoAdmin = document.getElementById("escudoSuperAdmin"); 
  const btnSalirPredi = document.getElementById("btnSalirPredi");
  const navbar = document.getElementById("navbarGlobal");

  if (elLogin) elLogin.style.display = "none";
  
  if (typeof aplicarPermisos === "function") aplicarPermisos();

  if (currentRole === "predi") {
    if (badge) badge.innerText = "Publicador (Predi)";
    if (escudoAdmin) escudoAdmin.style.display = "none";
    if (btnSalirPredi) btnSalirPredi.style.display = "block";
    if (navbar) navbar.style.display = "none";
    
    console.log("⚡ Entorno PUBLICADOR (Puerta a puerta) configurado de forma segura y limpia.");
    await descargarBaseAdministrativa();
    
    if (typeof limpiarVista === "function") limpiarVista();
    abrirVista("appContainer");

  } else if (currentRole === "conductor") {
    if (badge) badge.innerText = "Conductor de Grupo";
    if (escudoAdmin) escudoAdmin.style.display = "none"; 
    if (btnSalirPredi) btnSalirPredi.style.display = "none";
    if (navbar) navbar.style.display = "flex";
    
    console.log("🗺️ Entorno CONDUCTOR configurado.");
    await descargarBaseAdministrativa();
    
    // 🔥 FILTRADO CRÍTICO: barremos el botón de súper admin para el conductor
    aplicarFiltrosVisualesPorRol();
    
    abrirVista("dashboardView");

  } else if (currentRole === "admin") {
    if (badge) badge.innerText = "Administrador";
    if (escudoAdmin) escudoAdmin.style.display = "inline-block"; 
    if (btnSalirPredi) btnSalirPredi.style.display = "none";
    if (navbar) navbar.style.display = "flex";
    
    console.log("👑 Entorno ADMINISTRADOR TOTAL activo.");
    await descargarBaseAdministrativa();
    
    // 🔥 FILTRADO CRÍTICO: mostramos el botón de súper admin
    aplicarFiltrosVisualesPorRol();
    
    abrirVista("dashboardView");
  }
}

/**
 * 6. RECOLECTOR MASIVO DE DATOS (CON PERSISTENCIA LOCAL EN LOCALSTORAGE)
 * MODIFICADO: Si hay internet actualiza el LocalStorage, si está offline lee del LocalStorage.
 */
async function descargarBaseAdministrativa() {
  try {
    console.log("⏳ Sincronizando datos con el servidor...");
    
    // Intentamos descargar los datos frescos del servidor
    const respuesta = await apiFetch('/admin/buildings?all=true', { method: "GET" });
    if (!respuesta.ok) throw new Error(`Error ${respuesta.status}`);

    const resultado = await respuesta.json();
    const edificios = resultado.data || [];
    
    // Guardamos en memoria volátil de la aplicación
    window.baseDatosEdificiosMemoria = edificios;
    window.todosLosEdificiosDB = edificios;
    
    // 🔥 ¡CLAVE OFFLINE!: Respaldamos la base de datos completa en la memoria física del celular
    localStorage.setItem('cache_edificios_offline', JSON.stringify(edificios));
    
    console.log(`✅ Sincronización exitosa y caché actualizada. ${edificios.length} edificios guardados en LocalStorage.`);
  } catch (error) {
    console.warn("⚠️ Error en descarga (Posiblemente estás OFFLINE):", error.message);
    
    // 🛡️ ESTRATEGIA DE RESCATE: Intentamos leer el respaldo del teléfono
    const cacheLocal = localStorage.getItem('cache_edificios_offline');
    if (cacheLocal) {
      const edificiosCacheados = JSON.parse(cacheLocal);
      window.baseDatosEdificiosMemoria = edificiosCacheados;
      window.todosLosEdificiosDB = edificiosCacheados;
      console.log(`🚨 Modo Offline Activo: Se restauraron con éxito ${edificiosCacheados.length} edificios desde el almacenamiento interno.`);
    } else {
      console.error("❌ Error Crítico: No hay internet ni tampoco copias de seguridad locales en el teléfono.");
      window.baseDatosEdificiosMemoria = [];
      window.todosLosEdificiosDB = [];
    }
  }
}

/** * 7. ENRUTADOR DINÁMICO DE PANTALLAS (PROTECCIÓN ESTRICTA POR ROL) 
 * MODIFICADO: Removidos los contadores analíticos para maximizar espacio útil en la UI. */
function abrirVista(vistaId) {
  // Seguro para que el predi no acceda a paneles administrativos
  if (currentRole === "predi" && vistaId !== "editarView" && vistaId !== "appContainer") {
    abrirVista("appContainer");
    return;
  }

  const vistas = ["loginScreen", "dashboardView", "territorioView", "problemasView", "appContainer", "editarView", "superAdminView", "mapaView"];
  
  vistas.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === vistaId) {
        el.style.display = "block";
        el.classList.add("active");
      } else {
        el.style.display = "none";
        el.classList.remove("active");
      }
    }
  });

  // Disparadores automáticos de mapas y filtros
  if (vistaId === "territorioView") {
    setTimeout(() => {
      if (typeof ejecutarFiltrosAdmin === "function") ejecutarFiltrosAdmin();
      // 🧼 LIMPIEZA: Se eliminó el refuerzo de los contadores informativos obsoletos
    }, 100);
  }

  // 🔔 DISPARADOR AUTOMÁTICO: Carga el Layout Premium al ingresar a la vista de reportes
  if (vistaId === "problemasView") {
    setTimeout(() => {
      if (typeof verProblemas === "function") verProblemas();
    }, 100);
  }

  if (vistaId === "mapaView") {
    setTimeout(() => {
      if (typeof inicializarMapaGeneralAdministrador === "function") inicializarMapaGeneralAdministrador();
      if (typeof mapaGeneral !== 'undefined' && mapaGeneral) {
        mapaGeneral.invalidateSize({ animate: false });
      }
    }, 100);
  }
}

/** * 8. CIERRE DE SESIÓN */
function logout() {
  const buscador = document.getElementById("buildingId");
  if (buscador) buscador.value = "";

  localStorage.clear();
  currentUser = "";
  currentRole = "";
  window.todosLosEdificiosDB = [];
  window.baseDatosEdificiosMemoria = [];
  window.edificiosEncontrados = [];
  
  if (typeof limpiarVista === "function") limpiarVista();

  abrirVista("loginScreen");
}

/** * 9. RECEPTOR DE CARGA DEL DOCUMENTO Y ESCANEO QR */
window.addEventListener("load", async () => {
  const savedUser = localStorage.getItem("username") || localStorage.getItem("user");
  const savedRole = localStorage.getItem("role");
  
  const btnSalirPredi = document.getElementById("btnSalirPredi");

  if (savedUser && savedRole) {
    currentUser = savedUser;
    currentRole = savedRole;
    console.log(`🔄 Restaurando sesión activa para: ${currentUser} (${currentRole})`);
    
    document.documentElement.setAttribute("data-user-role", currentRole);
    await iniciarAppConPermisos();
  } else {
    // Si no hay sesión, reiniciamos las variables de rol de manera segura
    currentRole = null; 
    document.documentElement.removeAttribute("data-user-role");
    if (btnSalirPredi) btnSalirPredi.style.display = "none"; // Ocultamos por seguridad en login
    abrirVista("loginScreen");
  }
  
  const params = new URLSearchParams(window.location.search);
  const buildingIdParam = params.get("building");
  
  if (buildingIdParam && typeof cargarDepto === "function") {
    currentBuildingId = buildingIdParam;
    if (document.getElementById("mensajeInicial")) {
      document.getElementById("mensajeInicial").style.display = "none";
    }
    await cargarDepto();
  }
  
  // 🔥 SOLUCIÓN DEFINITIVA: Si es predi, el botón de salir DEBE existir siempre visible al fondo
  if (currentRole === "predi" && btnSalirPredi) {
    btnSalirPredi.style.display = "block";
  }
});

/** * 10. INICIALIZADOR INMEDIATO AUTOCONVOCADO */
(function iniciarValidacionInmediata() {
  console.log("🔄 Inicializando núcleo de la aplicación...");

  const ejecutarControl = () => {
    const usuarioGuardado = localStorage.getItem("username");
    const rolGuardado = localStorage.getItem("role");

    if (!usuarioGuardado || !rolGuardado) {
      localStorage.clear();
      const loginScreen = document.getElementById("loginScreen");
      if (loginScreen) {
        loginScreen.style.display = "block";
        loginScreen.classList.add("active");
      }
      const navbar = document.getElementById("navbarGlobal");
      if (navbar) navbar.style.display = "none";

      ["dashboardView", "territorioView", "problemasView", "appContainer", "editarView", "superAdminView", "mapaView"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.style.display = "none";
          el.classList.remove("active");
        }
      });
      return;
    }

    currentRole = rolGuardado;
    currentUser = usuarioGuardado;

    const loginScreen = document.getElementById("loginScreen");
    if (loginScreen) loginScreen.style.display = "none";

    const navbar = document.getElementById("navbarGlobal");
    const badge = document.getElementById("badge-rol-usuario");

    if (navbar) navbar.style.display = "flex";

    // 🛡️ REFUERZO DE SEGURIDAD OPERATIVA
    if (currentRole === "admin") {
      if (badge) badge.innerText = "Administrador";
      aplicarFiltrosVisualesPorRol(); // 🔥 Controlamos visuales al iniciar
      abrirVista("dashboardView");
    } else if (currentRole === "conductor") {
      if (badge) badge.innerText = "Conductor de Grupo";
      aplicarFiltrosVisualesPorRol(); // 🔥 Oculta de raíz la tarjeta crítica si carga directo por URL
      abrirVista("dashboardView");
    } else if (currentRole === "predi") {
      if (badge) badge.innerText = "Publicador (Predi)";
      aplicarFiltrosVisualesPorRol();
      abrirVista("appContainer");
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ejecutarControl);
  } else {
    ejecutarControl();
  }
})();

// =========================================================================
// 📱 SECTOR: MOTOR DE BÚSQUEDA, FLUIDO DE VISITA Y CONTROL ANTI-ERROR (PREDI)
// =========================================================================

/** * 1. MOTOR DE BÚSQUEDA * Busca un edificio por dirección o código de forma híbrida (Servidor / Caché Local). */
async function buscar() {
  if (typeof limpiarVista === "function") {
    limpiarVista();
  } else {
    const res = document.getElementById("resultado");
    if (res) res.innerHTML = "";
  }
  
  const inputCampo = document.getElementById("buildingId") || (typeof buildingId !== 'undefined' ? buildingId : null);
  if (!inputCampo) {
    console.error("❌ Error: No se encontró el elemento input 'buildingId'.");
    return;
  }
  
  const textoOriginal = inputCampo.value.trim();
  const input = typeof normalizarDireccion === "function" ? normalizarDireccion(inputCampo.value) : textoOriginal.toLowerCase();
  if (!input) return;
  
  console.log(`🔍 Buscando edificio de forma híbrida para: '${input}'`);
  if (document.getElementById("mensajeInicial")) {
    document.getElementById("mensajeInicial").style.display = "none";
  }
  
  const resLabel = document.getElementById("resultado");
  // 🔥 MEJORA DE TIPOGRAFÍA: Evita que el texto intermedio "Buscando..." rompa el diseño por heredar el tamaño h2
  if (resLabel) {
    resLabel.innerHTML = `<span style="font-size: 16px; font-weight: 700; color: #a1a1aa; letter-spacing: 0.3px;">Buscando edificio...</span>`;
  }

  // 🛡️ INTERCEPTOR MODO OFFLINE PREVENTIVO
  if (!navigator.onLine) {
    console.log("📡 [MODO OFFLINE] Buscando edificio en la base de datos local cacheada...");
    const edificiosLocales = window.baseDatosEdificiosMemoria || [];
    
    // Buscamos coincidencia por ID exacto, por dirección exacta o por inclusión de texto
    const edificioEncontrado = edificiosLocales.find(b => 
      b._id === textoOriginal || 
      (b.address && (b.address.toLowerCase() === input || b.address.toLowerCase().includes(input)))
    );

    if (edificioEncontrado) {
      if (edificioEncontrado.isBlocked) {
        mostrarAviso("ACCESO DENEGADO: Este edificio está bloqueado por el Administrador.", "error");
        if (resLabel) resLabel.innerText = ""; 
        return;
      }
      window.currentBuildingId = edificioEncontrado._id;
      window.edificioActivo = edificioEncontrado;
      console.log(`✅ [LOCAL] Edificio detectado fuera de línea: ${edificioEncontrado.address}.`);
      await sortearSiguienteDepartamento(false);
      return;
    } else {
      console.warn("⚠️ Edificio no hallado en la base de datos interna local.");
      tratarEdificioNoEncontrado();
      return;
    }
  }

  // 🌐 MODO ONLINE STANDARD: Intenta resolver contra la API en la nube
  try {
    const b = await apiFetch(`/building/${encodeURIComponent(input)}`);
    if (!b.ok) {
      if (b.status === 404) {
        tratarEdificioNoEncontrado();
        return;
      }
      throw new Error(`Error en servidor: ${b.status}`);
    }
    const building = await b.json();
    
    if (building.error === "NOT_FOUND" || !building || !building._id) {
      tratarEdificioNoEncontrado();
      return;
    }
    
    if (building.error === "EDIFICIO_BLOQUEADO" || building.isBlocked) {
      mostrarAviso("ACCESO DENEGADO: Este edificio está bloqueado por el Administrador.", "error");
      if (resLabel) resLabel.innerText = ""; 
      if (document.getElementById("departamentoVisitar")) {
        document.getElementById("departamentoVisitar").innerText = "--";
      }
      return; 
    }
    
    window.currentBuildingId = building._id;
    window.edificioActivo = building;
    console.log(`✅ Edificio detectado en red: ${building.address}. Solicitando primer depto...`);
    await sortearSiguienteDepartamento(false);
  } catch (error) {
    console.error("❌ Falló búsqueda en red, reingresando por contingencia local:", error);
    
    // Fallback de rescate si el fetch falló por microcorte físico de red justo en la consulta
    const edificiosLocales = window.baseDatosEdificiosMemoria || [];
    const edificioEncontrado = edificiosLocales.find(b => b.address && b.address.toLowerCase().includes(input));
    if (edificioEncontrado) {
      window.currentBuildingId = edificioEncontrado._id;
      window.edificioActivo = edificioEncontrado;
      await sortearSiguienteDepartamento(false);
    } else {
      tratarEdificioNoEncontrado();
    }
  }
}

/** * 2. ALGORITMO DE EXCLUSIÓN Y SORTEO * Sortea un departamento aleatorio no visitado recientemente de forma híbrida (API / Simulación Local). */
async function sortearSiguienteDepartamento(mostrarAlerta = true) {
  const buildingId = window.currentBuildingId;
  if (!buildingId) {
    console.warn("⚠️ No se puede sortear un departamento porque no hay buildingId activo.");
    return;
  }

  // 🛡️ INTERCEPTOR ALGORÍTMICO OFFLINE / FALLBACK LOCAL
  if (!navigator.onLine) {
    console.log("🎲 [MODO OFFLINE] Ejecutando algoritmo de exclusión y sorteo local...");
    const edificioLocal = window.baseDatosEdificiosMemoria?.find(b => b._id === buildingId) || window.edificioActivo;
    
    if (!edificioLocal || !edificioLocal.departments || edificioLocal.departments.length === 0) {
      mostrarAviso("Este edificio no contiene departamentos configurados en la memoria local.", "warning");
      return;
    }

    // Buscamos las visitas offline guardadas en el dispositivo para este edificio para cruzarlas
    const visitasPendientes = JSON.parse(localStorage.getItem("visitas_pendientes")) || [];
    const deptosVisitadosOfflineIds = visitasPendientes
      .filter(v => v.buildingId === buildingId)
      .map(v => v.departmentId);

    // Filtrar departamentos que no hayan sido completados o visitados recientemente en los datos cacheados
    const deptosDisponibles = edificioLocal.departments.filter(d => {
      // Excluir si ya fue votado en la tanda offline actual
      if (deptosVisitadosOfflineIds.includes(d._id)) return false;
      // Excluir si tiene un bloqueo específico o marca de exclusión histórica en la caché
      if (d.lastVisit) {
        const mesesExclusion = 4;
        const limiteFecha = new Date();
        limiteFecha.setMonth(limiteFecha.getMonth() - mesesExclusion);
        if (new Date(d.lastVisit) > limiteFecha) return false;
      }
      return true;
    });

    if (deptosDisponibles.length === 0) {
      mostrarAviso("Todos los departamentos ya fueron visitados en esta tanda offline.", "warning");
      window.departamentoEnFoco = null;
      const resultadoH2 = document.getElementById("resultado");
      // 🔥 MEJORA DE DISEÑO: Estilo controlado para la palabra "Fin"
      if (resultadoH2) resultadoH2.innerHTML = `<span style="font-size: 20px; font-weight: 800; color: #3b82f6;">Fin</span>`;
      return;
    }

    // Algoritmo de asignación aleatoria pura sobre el universo de unidades disponibles
    const deptoElegido = deptosDisponibles[Math.floor(Math.random() * deptosDisponibles.length)];
    window.departamentoEnFoco = deptoElegido;
    
    console.log(`🎯 Sorteo local offline exitoso. Unidad asignada: ${deptoElegido.number}`);
    await mostrarEstructuraFlujoVisita();
    if (mostrarAlerta && typeof notify === "function") {
      notify("Nuevo departamento asignado (Modo Local)");
    }
    return;
  }

  // 🌐 MODO ONLINE STANDARD: Petición regular a la API del backend
  try {
    console.log(`🎲 Solicitando depto aleatorio al backend para edificio: ${buildingId}...`);
    const res = await apiFetch(`/next/${buildingId}`);
    if (!res) throw new Error("No se obtuvo respuesta del servidor.");
    const data = res.json ? await res.json() : res;
    
    if (data.message === "NO_AVAILABLE" || data.message === "COMPLETED") {
      mostrarAviso("Todos los departamentos fueron visitados en los últimos 4 meses.", "warning");
      window.departamentoEnFoco = null;
      const resultadoH2 = document.getElementById("resultado");
      // 🔥 MEJORA DE DISEÑO: Estilo controlado para la palabra "Fin" online
      if (resultadoH2) resultadoH2.innerHTML = `<span style="font-size: 20px; font-weight: 800; color: #3b82f6;">Fin</span>`;
      return;
    }
    
    if (data.message === "EDIFICIO_BLOQUEADO") {
      mostrarAviso("Este edificio está bloqueado de forma administrativa.", "error");
      tratarEdificioNoEncontrado();
      return;
    }

    if (data && data.dept) {
      window.departamentoEnFoco = data.dept;
      console.log(`🎯 Sorteo exitoso de red. Próximo depto: ${data.dept.number}`);
      await mostrarEstructuraFlujoVisita();
      if (mostrarAlerta && typeof notify === "function") {
        notify("Nuevo departamento asignado");
      }
    }
  } catch (err) {
    console.error("❌ Error en sorteo de red, intentando conmutar a algoritmo local de emergencia:", err);
    navigator.onLine = false; 
    await sortearSiguienteDepartamento(mostrarAlerta);
    navigator.onLine = true;
  }
}

/** * 3. CONTROLADOR INTERFAZ FLUJO MÓVIL * Sincroniza la visibilidad y limpia los paneles de index.html para iniciar la votación. */
async function mostrarEstructuraFlujoVisita() {
  const d = window.departamentoEnFoco;
  const resultadoH2 = document.getElementById("resultado");
 if (resultadoH2) {
  resultadoH2.innerText = d && d.number ? d.number : "--";
  resultadoH2.style.fontSize = "40px"; // 🔥 Agrandado un 40% para mejor visualización
  resultadoH2.style.fontWeight = "800"; 
}
  
  const btnSiguiente = document.getElementById("btnSiguiente");
  if (btnSiguiente) {
    btnSiguiente.style.visibility = "hidden";
    btnSiguiente.style.display = "none";
    btnSiguiente.setAttribute("onclick", "ejecutarAvanzarDepartamento()");
  }
  
  document.getElementById("btnOk")?.classList.remove("seleccionado");
  document.getElementById("btnNo")?.classList.remove("seleccionado");
  
  const botonera = document.getElementById("botoneraVotacion");
  // 🔥 CONTROL DE INTERFAZ: Asegura alineación interna robusta en móviles al activarse
  if (botonera) {
    botonera.style.display = "flex";
    botonera.style.alignItems = "center";
    botonera.style.justifyContent = "space-between";
  }
  
  if (document.getElementById("mensajeInicial")) document.getElementById("mensajeInicial").style.display = "none";
  if (document.getElementById("nota")) document.getElementById("nota").style.display = "block";
  if (document.getElementById("btnOk")) document.getElementById("btnOk").style.display = "block";
  if (document.getElementById("btnNo")) document.getElementById("btnNo").style.display = "block";
  if (document.getElementById("btnNuevoEdificio")) document.getElementById("btnNuevoEdificio").style.display = "none";
  
  console.log("🔄 Cargando info estática del edificio...");
  await mostrarInfoEdificio();
}

/** * 4. FICHADO TÉCNICO Y MAPA ESTÁTICO INTERCEPTABLE * Rellena la tarjeta informativa inferior y el mini mapa (Apagado automático si está offline). */
async function mostrarInfoEdificio() {
  const currentBuildingId = window.currentBuildingId;
  if (!currentBuildingId) {
    console.warn("⚠️ No se puede cargar info del edificio porque currentBuildingId está vacío.");
    return;
  }

  let edificioData = null;
  let ultimaVisitaTexto = "Nunca";
  let issueHtml = "";

  // 🛡️ RECOLECCIÓN DE DATOS INTELIGENTE (RED VS CACHÉ LOCAL)
  if (!navigator.onLine) {
    console.log("📋 [MODO OFFLINE] Renderizando ficha técnica desde datos locales...");
    const edificioLocal = window.baseDatosEdificiosMemoria?.find(b => b._id === currentBuildingId) || window.edificioActivo;
    if (edificioLocal) {
      edificioData = edificioLocal;
      ultimaVisitaTexto = "Offline (Sin datos)";
    }
  } else {
    try {
      const res = await apiFetch(`/building-info/${currentBuildingId}`);
      
if (res) {
  const data = res.json ? await res.json() : res;
  edificioData = data.building;
  ultimaVisitaTexto = data.lastVisit ? new Date(data.lastVisit.date).toLocaleDateString('es-AR') : "Nunca";
  if (data.issue) {
    
    issueHtml = `
      <div style="position: absolute; top: 14px; right: 14px; font-size: 20px; z-index: 10;" title="Alerta: ${data.issue.type}">
        ⚠️
      </div>
    `;
  }
}
    } catch (err) {
      console.warn("Error buscando info extendida en red, usando datos básicos locales:", err);
      edificioData = window.edificioActivo;
    }
  }

  const b = edificioData;
  if (!b) return;

  // ✨ Cálculo de Edificio Nuevo (Lapso de 30 días)
  let cartelNuevoHtml = "";
  if (b.createdAt || b.fechaCreacion) { 
    const fechaCreacion = new Date(b.createdAt || b.fechaCreacion);
    const hoy = new Date();
    const diferenciaDias = Math.floor((hoy - fechaCreacion) / (1000 * 60 * 60 * 24));
    if (diferenciaDias <= 30 && !isNaN(diferenciaDias)) {
      const fechaFormateada = fechaCreacion.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      cartelNuevoHtml = `Edificio creado el ${fechaFormateada}`;
    }
  }
  
  if (typeof reportBtn !== 'undefined' && reportBtn) {
    reportBtn.style.display = "none"; 
  }
  
  const infoEdificio = document.getElementById("infoEdificio");
  if (!infoEdificio) return;
  infoEdificio.style.display = "block";

  // 🔥 CONDICIONAL DE MAPA: Si no hay internet, ocultamos por completo el bloque del mapa para optimizar espacio
  const mostrarMapaVisual = navigator.onLine ? "flex" : "none";

 infoEdificio.innerHTML = `
  <div class="sectionCard" style="position: relative; background: #121214; border: 1px solid #27272a; padding: 16px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.4);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom: 14px;">
        <div>
          <div style="font-size:24px; font-weight:800; color:#ffffff; line-height:1.2; letter-spacing: -0.5px;">${b.address}</div>
          <div style="color:#d4d4d8; font-size:14px; margin-top:4px; font-weight: 500;">${b.address2 || "Sin datos adicionales"}</div>
        </div>
        <div style="background:#27272a; padding:6px 10px; border-radius:8px; font-size:13px; font-weight:700; white-space:nowrap; color:#ffffff; border: 1px solid #3f3f46;">🏢 ${b.name || "Edificio"}</div>
      </div>
      <div style="display: flex; gap: 14px; align-items: center; justify-content: space-between;">
        <div style="flex: 1; display: flex; flex-direction: column; gap: 8px; font-size: 14px; color:#ffffff;">
          <div>🗺️ <b>Territorio:</b> <span style="background: #27272a; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${b.territory || "-"}</span></div>
          <div>🔢 <b>Pisos:</b> <span style="font-weight: 600; color: #3b82f6;">${b.floors || 0}</span></div>
          <div style="color:#e4e4e7; font-size: 13px; line-height: 1.3;">📋 <b>Notas:</b> <span style="font-style: italic; color: #d4d4d8;">${b.description || "Sin anotaciones."}</span></div>
        </div>
        <div id="wrapperMapaYFecha" style="display: ${mostrarMapaVisual}; flex-direction: column; gap: 6px; align-items: center; flex-shrink: 0;">
          <div id="miniMapaPredi" style="width: 115px; height: 95px; border-radius: 10px; border: 1px solid #4b5563; background:#1f1f22; pointer-events: none;"></div>
          <div style="background: #27272a; border: 1px solid #3f3f46; border-radius: 6px; padding: 4px 6px; display: flex; align-items: center; gap: 4px; font-size: 11px; color: #e4e4e7; width: 115px; justify-content: center; box-sizing: border-box;">
            <span>🗓️</span> <span>${ultimaVisitaTexto}</span>
          </div>
        </div>
      </div>
      <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid #27272a; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
        <div style="flex: 1; font-size: 12px; color:#a1a1aa; font-weight: 500; text-align: left;">
          ${cartelNuevoHtml ? `🏢 ${cartelNuevoHtml}` : ""}
        </div>
        <div style="flex: 1; display: flex; justify-content: flex-end;">
          <button onclick="abrirReporte()" style="background:#451a1a; color:#f87171; border:1px solid #ef4444; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px; white-space: nowrap; width: auto; margin: 0;">
            ⚠️ Informar problema
          </button>
        </div>
      </div>
      ${issueHtml}
    </div>
  `;

  // Renderización condicionada del mapa Leaflet (Solo si hay red operativa)
  if (navigator.onLine) {
    const miniMapaDiv = document.getElementById("miniMapaPredi");
    if (miniMapaDiv) {
      if (typeof prediMiniMap !== 'undefined' && prediMiniMap) {
        try { prediMiniMap.remove(); } catch(e){}
        prediMiniMap = null;
      }
      prediMiniMap = L.map('miniMapaPredi', {
        zoomControl: false, dragging: false, touchZoom: false,
        scrollWheelZoom: false, doubleClickZoom: false
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(prediMiniMap);
      
      let centradoExitoso = false;
      if (b.latitude && b.longitude) {
        const lat = parseFloat(b.latitude);
        const lng = parseFloat(b.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          L.marker([lat, lng]).addTo(prediMiniMap);
          prediMiniMap.setView([lat, lng], 16);
          centradoExitoso = true;
        }
      }
      if (!centradoExitoso && b.territory && typeof misTerritoriosGeoJSON !== 'undefined' && misTerritoriosGeoJSON) {
        let capaGeoJSON = L.geoJSON(misTerritoriosGeoJSON, {
          filter: (f) => String(f.properties.name || f.properties.Territorio_N) === String(b.territory),
          style: { color: '#2563eb', weight: 2, fillColor: '#2563eb', fillOpacity: 0.15 }
        }).addTo(prediMiniMap);
        if (capaGeoJSON.getLayers().length > 0) {
          prediMiniMap.fitBounds(capaGeoJSON.getBounds(), { padding: [5, 5] });
          centradoExitoso = true;
        }
      }
      if (!centradoExitoso) {
        prediMiniMap.setView([-27.36708, -55.89608], 15);
      }
      setTimeout(() => { if (prediMiniMap) prediMiniMap.invalidateSize(); }, 220);
    }
  }
}

// =========================================================================
// 🔀 CONTROL DE VISITAS EN MEMORIA VOLÁTIL Y TRANSMISIÓN AL AVANZAR (ACUMULADO)
// =========================================================================
window.votoTemporal = null;

/** * 5. SELECCIÓN DE ESTADO EN PANTALLA */
function marcar(estado) {
  if (estado !== "ATENDIO" && estado !== "NO_EN_CASA") {
    console.error(`❌ Error crítico: Se intentó seleccionar un estado inválido: "${estado}"`);
    return;
  }
  if (!window.departamentoEnFoco || !window.departamentoEnFoco._id) {
    // 🌟 CAMBIO: Se usa mostrarAviso en lugar de alert
    mostrarAviso("No hay un departamento en foco para asignarle este estado.", "warning");
    return;
  }
  
  const btnOk = document.getElementById("btnOk");
  const btnNo = document.getElementById("btnNo");
  if (btnOk) btnOk.classList.remove("seleccionado");
  if (btnNo) btnNo.classList.remove("seleccionado");
  
  if (estado === "ATENDIO" && btnOk) {
    btnOk.classList.add("seleccionado");
    console.log("🟢 Interfaz: Botón 'ATENDIÓ' encendido.");
  } else if (estado === "NO_EN_CASA" && btnNo) {
    btnNo.classList.add("seleccionado");
    console.log("🔴 Interfaz: Botón 'NO EN CASA' encendido.");
  }
  
  window.votoTemporal = estado;
  console.log(`📌 Estado seleccionado en memoria: "${window.votoTemporal}"`);
  
  const btnSiguiente = document.getElementById("btnSiguiente");
  if (btnSiguiente) {
    btnSiguiente.style.visibility = "visible";
    btnSiguiente.style.display = "inline-block";
  }
}

/** * 6. CONFIRMACIÓN Y AVANCE DE UNIDAD * Transmite de forma asíncrona o inyecta en LocalStorage en milisegundos sin bloquear la interfaz. */
async function ejecutarAvanzarDepartamento() {
  console.log("🎯 Avanzando departamento...");
  if (!window.currentBuildingId) {
    // 🌟 CAMBIO: Se usa mostrarAviso en lugar de alert
    mostrarAviso("Error: No hay un edificio activo seleccionado.", "error");
    return;
  }
  if (!window.departamentoEnFoco || !window.departamentoEnFoco._id) {
    // 🌟 CAMBIO: Se usa mostrarAviso en lugar de alert
    mostrarAviso("Error: No hay un departamento activo en foco.", "error");
    return;
  }
  if (!window.votoTemporal) {
    // 🌟 CAMBIO: Se usa mostrarAviso en lugar de alert
    mostrarAviso("Por favor, selecciona primero si atendió o no está en casa antes de avanzar.", "warning");
    return;
  }
  
  const deptoNumero = window.departamentoEnFoco.number;
  const notaInput = document.getElementById("nota") || document.getElementById("observacionRapida");
  const comentario = notaInput ? notaInput.value.trim() : "";
  
  const cuerpoPayload = {
    departmentId: window.departamentoEnFoco._id,
    buildingId: window.currentBuildingId,
    status: window.votoTemporal, 
    note: comentario ? comentario : `Visita realizada al depto ${deptoNumero}`
  };

  // 🔥 ENFOQUE OPTIMIZADO: Si está offline, guarda directo. Si está online, dispara el fetch de fondo pero avanza la UI inmediatamente
  if (!navigator.onLine) {
    console.warn(`📡 [MODO OFFLINE] Guardando depto ${deptoNumero} directamente en memoria local...`);
    guardarEnMochilaLocal("visitas_pendientes", cuerpoPayload);
  } else {
    console.log(`🚀 Despachando visita del depto ${deptoNumero} a la cola asíncrona de red...`);
    // Corremos el fetch sin el 'await' de bloqueo para que la pantalla del celular rote al instante
    apiFetch("/visit", {
      method: "POST",
      body: JSON.stringify(cuerpoPayload)
    }).catch(err => {
      console.warn("⚠️ Falló envío asincrónico en movimiento, resguardando en caché local:", err);
      guardarEnMochilaLocal("visitas_pendientes", cuerpoPayload);
    });
  }

  // --- FASE DE RESETEO INMEDIATO (FLUIDEZ ABSOLUTA) ---
  if (notaInput) notaInput.value = "";
  window.votoTemporal = null; 
  
  // Sorteamos la próxima unidad inmediatamente sin esperar respuestas del servidor
  await sortearSiguienteDepartamento(false);
}

/** * 💾 SOPORTE LOCALSTORAGE */
function guardarEnMochilaLocal(clave, datos) {
  let listado = JSON.parse(localStorage.getItem(clave)) || [];
  datos.guardadoEnLocalEl = new Date().toISOString(); 
  listado.push(datos);
  localStorage.setItem(clave, JSON.stringify(listado));
  console.log(`📦 Elemento guardado en local (${clave}). Total acumulado offline: ${listado.length}`);
}

/** * 📡 EL VIGILANTE DE INTERNET * Sincroniza en segundo plano los datos acumulados apenas el dispositivo recupera señal móvil estable. */
window.addEventListener('online', async () => {
  const visitasPendientes = JSON.parse(localStorage.getItem("visitas_pendientes")) || [];
  const reportesPendientes = JSON.parse(localStorage.getItem("reportes_pendientes")) || [];
  const edificiosPendientes = JSON.parse(localStorage.getItem("edificios_pendientes")) || [];
  
  if (visitasPendientes.length === 0 && reportesPendientes.length === 0 && edificiosPendientes.length === 0) return;
  
  console.log(`📡 Conexión recuperada. Sincronizando: ${visitasPendientes.length} visitas, ${reportesPendientes.length} reportes y ${edificiosPendientes.length} edificios...`);
  let erroresCarga = false;

  // 1. Despachamos las visitas retenidas
  if (visitasPendientes.length > 0) {
    const visitasNoEnviadas = [];
    for (let visita of visitasPendientes) {
      try {
        const res = await apiFetch("/visit", { method: "POST", body: JSON.stringify(visita) });
        if (!res || !res.ok) throw new Error();
      } catch (err) {
        visitasNoEnviadas.push(visita);
        erroresCarga = true;
      }
    }
    if (visitasNoEnviadas.length > 0) {
      localStorage.setItem("visitas_pendientes", JSON.stringify(visitasNoEnviadas));
    } else {
      localStorage.removeItem("visitas_pendientes");
    }
  }

  // 2. Despachamos los reportes retenidos (issues)
  if (reportesPendientes.length > 0) {
    const reportesNoEnviados = [];
    for (let reporte of reportesPendientes) {
      try {
        const res = await apiFetch("/issues", { method: "POST", body: JSON.stringify(reporte) });
        if (!res || !res.ok) throw new Error();
      } catch (err) {
        reportesNoEnviados.push(reporte);
        erroresCarga = true;
      }
    }
    if (reportesNoEnviados.length > 0) {
      localStorage.setItem("reportes_pendientes", JSON.stringify(reportesNoEnviados));
    } else {
      localStorage.removeItem("reportes_pendientes");
    }
  }

  // 🔥 3. NUEVO: Despachamos los edificios nuevos/editados retenidos offline
  if (edificiosPendientes.length > 0) {
    const edificiosNoEnviados = [];
    for (let edif of edificiosPendientes) {
      try {
        const url = edif.esModificacionLocal ? `/building/${edif._id}` : "/building";
        const metodo = edif.esModificacionLocal ? "PUT" : "POST";
        
        // Limpieza estética de flags temporales antes de enviar al backend
        delete edif.esModificacionLocal; 
        if (String(edif._id).startsWith("local_")) {
          delete edif._id;
        }

        const res = await apiFetch(url, { method: metodo, body: JSON.stringify(edif) });
        if (!res || !res.ok) throw new Error();
      } catch (err) {
        edificiosNoEnviados.push(edif);
        erroresCarga = true;
      }
    }
    if (edificiosNoEnviados.length > 0) {
      localStorage.setItem("edificios_pendientes", JSON.stringify(edificiosNoEnviados));
    } else {
      localStorage.removeItem("edificios_pendientes");
    }
  }

  // Alerta ligera al usuario y recarga de las bases de datos
  if (!erroresCarga) {
    // 🌟 CAMBIO: Se usa mostrarAviso en lugar de alert
    mostrarAviso("🔄 ¡Datos sincronizados! Las visitas, reportes y edificios offline se subieron con éxito.");
    if (typeof preCargarBaseDatosEnMemoria === "function") await preCargarBaseDatosEnMemoria();
    if (typeof cargarEdificios === "function") cargarEdificios();
  } else {
    console.warn("⚠️ Sincronización parcial: Quedan elementos pendientes en zonas de baja cobertura.");
  }
});
// =========================================================================
// 🛠️ MÓDULO ADICIONAL: EDITOR EXPANDIDO DINÁMICO (CREACIÓN / EDICIÓN)
// =========================================================================

/** * 1. INTERRUPTOR VISUAL DE EXCEPCIONES * Oculta paneles y despliega opciones de rescate en caso de direcciones inexistentes. */
function tratarEdificioNoEncontrado() {
  const resLabel = document.getElementById("resultado");
  const btnNuevo = document.getElementById("btnNuevoEdificio");
  // CORREGIDO: Cambiado a "contenedorDepartamento" para que coincida con tu HTML real
  const deptoLabel = document.getElementById("contenedorDepartamento"); 
  const inputCampo = document.getElementById("buildingId");
  
  if (resLabel) {
    // Reducimos la tipografía a 16px y controlamos el diseño para que no rompa el contenedor
    resLabel.innerHTML = `<div style="color:#ef4444; text-align:center; padding:4px; font-size:16px; font-weight:800; white-space:nowrap;">Edificio no encontrado</div>`;
  }
  
  // Si querés que el contenedor de arriba oculte o cambie algo más, lo controlás acá
  // (Como ya pusimos el texto adentro de resLabel, este paso limpia lo demás)
  
  if (btnNuevo) {
    btnNuevo.style.setProperty("display", "block", "important");
    btnNuevo.onclick = function() {
      const direccionIngresada = inputCampo ? inputCampo.value.trim() : "";
      console.log(`➕ Pasarela de rescate: Abriendo editor dinámico para "${direccionIngresada}"`);
      abrirEditorEdificio({ address: direccionIngresada });
    };
  }
  
  // Ocultamos el resto de los componentes para limpiar la pantalla
  if (document.getElementById("botoneraVotacion")) document.getElementById("botoneraVotacion").style.display = "none";
  if (document.getElementById("nota")) document.getElementById("nota").style.display = "none";
  if (document.getElementById("btnOk")) document.getElementById("btnOk").style.display = "none";
  if (document.getElementById("btnNo")) document.getElementById("btnNo").style.display = "none";
  if (document.getElementById("infoEdificio")) document.getElementById("infoEdificio").style.display = "none";
}

// 🔔 VARIABLE DE MEMORIA: Guarda la última vista activa antes de entrar al editor
let vistaOrigenEdicion = "dashboardView";

/** * 2. APERTURA Y RENDERIZADO DEL EDITOR * Prepara e inyecta la pantalla de edición ocultando la interfaz del predi. (Desactiva el mapa automáticamente si está offline). */
function abrirEditorEdificio(objetoEdificio = null) {
  if (typeof objetoEdificio === "string") {
    const idBuscado = objetoEdificio;
    objetoEdificio = (window.todosLosEdificiosDB || window.baseDatosEdificiosMemoria || []).find(e => (e.id === idBuscado || e._id === idBuscado)) || null;
  }
  
  // 📸 CAPTURA DE MEMORIA: Detectamos dinámicamente dónde estaba parado el Admin antes de abrir el editor
  const problemasVisibles = document.getElementById("problemasView")?.style.display === "block" || document.getElementById("problemasView")?.classList.contains("active");
  const territorioVisible = document.getElementById("territorioView")?.style.display === "block" || document.getElementById("territorioView")?.classList.contains("active");
  const superAdminVisible = document.getElementById("superAdminView")?.style.display === "block" || document.getElementById("superAdminView")?.classList.contains("active");

  if (problemasVisibles) {
    vistaOrigenEdicion = "problemasView";
  } else if (territorioVisible) {
    vistaOrigenEdicion = "territorioView";
  } else if (superAdminVisible) {
    vistaOrigenEdicion = "superAdminView";
  } else {
    vistaOrigenEdicion = "dashboardView"; // Resguardo por defecto
  }

  const appContainer = document.getElementById("appContainer");
  const dashboardView = document.getElementById("dashboardView");
  
  if (appContainer) appContainer.style.setProperty("display", "none", "important");
  if (dashboardView) dashboardView.style.setProperty("display", "none", "important");
  
  abrirVista("editarView");
  
  const userRole = localStorage.getItem("role") || "predi";
  
  // 🔄 CORRECCIÓN QUIRÚRGICA: Si es admin, ejecuta la función dinámica en lugar del texto fijo anterior
  const funcionCancelar = (userRole === "predi") ? "cancelarEdificioMovil()" : "cancelarEdicionAdminDinamico()";
  const esNuevo = !objetoEdificio || !(objetoEdificio.id || objetoEdificio._id);
  const direccionSugerida = esNuevo ? (document.getElementById('buildingId')?.value || '') : '';
  
  // 🔥 DETECCIÓN OPERATIVA DE RED: Ocultamos el bloque del mapa si el teléfono está offline para no romper la estética
  const mostrarMapaVisual = navigator.onLine ? "block" : "none";

  let htmlContenido = `
    <div class="card-container" style="padding: 20px; max-width: 500px; margin: 0 auto; text-align: left;">
      <h3 style="margin-top:0; color:#fff; font-size: 20px; letter-spacing: -0.5px;">
        ${esNuevo ? "➕ Nuevo edificio" : "✏️ Editar edificio"} ${!navigator.onLine ? " <span style='font-size:12px; color:#f59e0b;'>(Modo Offline)</span>" : ""}
      </h3>
      
      <input type="hidden" id="edit_building_id" value="${objetoEdificio?.id || objetoEdificio?._id || ''}">
      
      <label style="font-size:12px; color:#a1a1aa; display:block; margin-top:8px;">Dirección Principal (Obligatoria)</label>
      <input id="edit_address" placeholder="Ej: Corrientes 2223" value="${objetoEdificio?.address || direccionSugerida}" style="width:100%; margin-bottom:8px; padding:10px; border-radius:8px;">
      
      <label style="font-size:12px; color:#a1a1aa; display:block;">Dirección 2 / Detalles de ubicación</label>
      <input id="edit_address2" placeholder="Ej: Esquina San Martín" value="${objetoEdificio?.address2 || ''}" style="width:100%; margin-bottom:8px; padding:10px; border-radius:8px;">
      
      <label style="font-size:12px; color:#a1a1aa; display:block;">Nombre del Edificio / Referencia</label>
      <input id="edit_name" placeholder="Ej: Torre del Sol" value="${objetoEdificio?.name || ''}" style="width:100%; margin-bottom:8px; padding:10px; border-radius:8px;">
      
      <div style="display:flex; gap:10px; margin-bottom:8px;">
        <div style="flex:1;">
          <label style="font-size:12px; color:#a1a1aa; display:block;">Territorio</label>
          <input id="edit_territory" type="number" placeholder="N°" value="${objetoEdificio?.territory || objetoEdificio?.territorio || ''}" style="width:100%; padding:10px; border-radius:8px;">
        </div>
        <div style="flex:1;">
          <label style="font-size:12px; color:#a1a1aa; display:block;">Pisos</label>
          <input id="edit_floors" type="number" placeholder="Pisos" value="${objetoEdificio?.floors || ''}" style="width:100%; padding:10px; border-radius:8px;">
        </div>
        <div style="flex:1;">
          <label style="font-size:12px; color:#a1a1aa; display:block;">Deptos x Piso</label>
          <input id="edit_units" type="number" placeholder="Cant." value="${objetoEdificio?.unitsPerFloor || ''}" style="width:100%; padding:10px; border-radius:8px;">
        </div>
      </div>
      
      <div style="display:flex; gap:20px; margin: 12px 0; background:#1c1c1e; padding:10px; border-radius:8px;">
        <label style="color:#fff; font-size:14px; cursor:pointer;">
          <input type="checkbox" id="edit_pb" ${objetoEdificio?.hasGroundFloor ? 'checked' : ''}> Planta Baja
        </label>
        <label style="color:#fff; font-size:14px; cursor:pointer;">
          <input type="checkbox" id="edit_portero" ${objetoEdificio?.hasDoorman ? 'checked' : ''}> Portero Eléctrico
        </label>
      </div>
      
      <label style="font-size:12px; color:#a1a1aa; display:block;">Descripción / Notas del Edificio</label>
      <textarea id="edit_description" placeholder="Notas operativas para ingresar..." rows="3" style="width:100%; margin-bottom:12px; padding:10px; border-radius:8px; background:#2c2c2e; border:1px solid #3a3a3c; color:#fff; resize:none;">${objetoEdificio?.description || ''}</textarea>
      
      <input type="hidden" id="edit_lat" value="${objetoEdificio?.latitude || ''}">
      <input type="hidden" id="edit_lng" value="${objetoEdificio?.longitude || ''}">
      
      <div id="contenedorMapaEditor" style="display: ${mostrarMapaVisual};">
        <p style="font-size:13px; margin: 5px 0; color:#a1a1aa;">📍 Arrastrá el marcador para fijar la ubicación exacta:</p>
        <div id="mapaEditor" class="mapaBox" style="height:200px; border-radius:12px; margin-bottom:15px; border:1px solid #3f3f46;"></div>
      </div>
      
      <button class="ok" onclick="guardarCambiosEditor()" style="width:100%; margin-bottom:10px; font-weight:bold; padding:12px;">💾 Guardar Edificio</button>
      <button class="secondary" onclick="${funcionCancelar}" style="width:100%; margin:0; padding:10px;">❌ Cancelar</button>
    </div>
  `;
  
  document.getElementById("editarView").innerHTML = htmlContenido;
  
  if (navigator.onLine) {
    setTimeout(() => {
      const mapaContenedor = document.getElementById("mapaEditor");
      if (!mapaContenedor) return;
      const latBase = parseFloat(objetoEdificio?.latitude || -27.36708);
      const lngBase = parseFloat(objetoEdificio?.longitude || -55.89608);
      document.getElementById('edit_lat').value = latBase;
      document.getElementById('edit_lng').value = lngBase;
      
      if (typeof leafletMap !== 'undefined' && leafletMap) {
        try {
          leafletMap.off();
          leafletMap.remove();
        } catch (e) { console.warn(e); }
        leafletMap = null;
      }
      
      leafletMap = L.map('mapaEditor', { zoomControl: true }).setView([latBase, lngBase], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(leafletMap);
      leafletMarker = L.marker([latBase, lngBase], { draggable: true }).addTo(leafletMap);
      
      leafletMarker.on('dragend', function() {
        const pos = leafletMarker.getLatLng();
        document.getElementById('edit_lat').value = pos.lat;
        document.getElementById('edit_lng').value = pos.lng;
      });
      
      leafletMap.on('click', function(e) {
        if (leafletMarker) {
          leafletMarker.setLatLng(e.latlng);
          document.getElementById('edit_lat').value = e.latlng.lat;
          document.getElementById('edit_lng').value = e.latlng.lng;
        }
      });
      setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 150);
    }, 250);
  }
}

/** * 🆕 NUEVA FUNCIÓN: Retorno inteligente y adaptativo para la administración*/
function cancelarEdicionAdminDinamico() {
  console.log("🔄 Regresando con memoria operativa a:", vistaOrigenEdicion);
    // Volvemos a la sección exacta guardada antes del click
  abrirVista(vistaOrigenEdicion);
  // Si volvimos de incidentes, relanzamos el renderizado para que la pantalla no quede en blanco
  if (vistaOrigenEdicion === "problemasView") {
    if (typeof verProblemas === "function") verProblemas();
  }
}

/** * 3. RETORNO DE INTERFAZ MÓVIL * Función de escape definitiva: Desactiva el editor de raíz y acopla el display del predi. */
function cancelarEdificioMovil() {
  console.log("🚪 Ejecutando salida limpia del editor...");
  const editarView = document.getElementById("editarView");
  if (editarView) {
    editarView.innerHTML = ""; 
    editarView.classList.remove("active");
    editarView.style.setProperty("display", "none", "important");
  }
  
  const appContainer = document.getElementById("appContainer");
  if (appContainer) {
    appContainer.style.setProperty("display", "block", "important");
  }
  
  if (typeof limpiarVista === "function") {
    limpiarVista();
  }
  
  if (typeof forzarReinicioBuscador === "function") {
    forzarReinicioBuscador();
  }
  
  const msgInicial = document.getElementById("mensajeInicial");
  if (msgInicial) msgInicial.style.setProperty("display", "block", "important");
}

/** * 4. PERSISTENCIA EN SERVIDOR CENTRAL (CON RESPALDO OFFLINE) * Procesa y emite los datos del formulario extendido de forma híbrida. */
async function guardarCambiosEditor() {
  const id = document.getElementById("edit_building_id")?.value;
  const address = document.getElementById("edit_address")?.value.trim();
  const address2 = document.getElementById("edit_address2")?.value.trim();
  const name = document.getElementById("edit_name")?.value.trim();
  const territory = document.getElementById("edit_territory")?.value.trim();
  const floors = parseInt(document.getElementById("edit_floors")?.value) || 0;
  const unitsPerFloor = parseInt(document.getElementById("edit_units")?.value) || 0;
  const latitude = parseFloat(document.getElementById("edit_lat")?.value) || -27.36708;
  const longitude = parseFloat(document.getElementById("edit_lng")?.value) || -55.89608;
  const hasGroundFloor = document.getElementById("edit_pb")?.checked || false;
  const hasDoorman = document.getElementById("edit_portero")?.checked || false;
  const description = document.getElementById("edit_description")?.value.trim();
  
  if (!address) {
    // 🌟 CAMBIO: Se usa mostrarAviso en lugar de alert
    mostrarAviso("El campo de dirección física es mandatorio.", "warning");
    return;
  }
  
  const payload = {
    address,
    address2,
    name,
    territory,
    floors,
    unitsPerFloor,
    latitude,
    longitude,
    hasGroundFloor,
    hasDoorman,
    description
  };

  // 🛡️ CASO OFFLINE DIRECTO: Guardado preventivo en la billetera local
  if (!navigator.onLine) {
    console.warn("📡 [MODO OFFLINE] Guardando cambios o alta de edificio de forma local...");
    const localPayload = { ...payload, _id: id || `local_${Date.now()}`, esModificacionLocal: !!id };
    
    // Lo guardamos en una cola específica para sincronizar edificios
    guardarEnMochilaLocal("edificios_pendientes", localPayload);
    
    // Inyección en caliente en la base de datos de memoria
    if (!window.baseDatosEdificiosMemoria) window.baseDatosEdificiosMemoria = [];
    
    // 🔥 REGENERACIÓN EN CALIENTE DE DEPARTAMENTOS PARA EVITAR "FANTASMAS" (Como el PB B)
    localPayload.departments = [];
    
    // Si el usuario MARCÓ que tiene Planta Baja, arrancamos los departamentos desde el piso 0
    const pisoInicial = hasGroundFloor ? 0 : 1; 
    
    for (let f = pisoInicial; f <= floors; f++) {
      for (let u = 1; u <= unitsPerFloor; u++) {
        // Si f es 0, el formato va a ser "PB A", "PB B". Si es mayor, "1°A", "2°B", etc.
        const etiquetaPiso = (f === 0) ? "PB" : `${f}°`;
        const letraDepto = String.fromCharCode(64 + u); // 1->A, 2->B, 3->C
        
        localPayload.departments.push({
          _id: `depto_local_${localPayload._id}_${f}_${u}`,
          number: `${etiquetaPiso} ${letraDepto}`, 
          floor: f
        });
      }
    }

    if (id) {
      const idx = window.baseDatosEdificiosMemoria.findIndex(e => (e.id === id || e._id === id));
      if (idx !== -1) {
        // Reemplazamos por completo el edificio viejo con el nuevo payload y sus deptos limpios
        window.baseDatosEdificiosMemoria[idx] = localPayload;
      }
    } else {
      window.baseDatosEdificiosMemoria.push(localPayload);
    }

    // 🌟 CAMBIO: Se usa mostrarAviso en lugar de alert
    mostrarAviso("Guardado localmente en tu celu. Departamentos re-estructurados.", "warning");
    
    const userRole = localStorage.getItem("role") || "predi";
    if (userRole === "admin") {
      abrirVista("dashboardView");
      if (typeof cargarEdificios === "function") cargarEdificios();
    } else {
      cancelarEdificioMovil();
    }
    return;
  }
  
  // 🌐 MODO ONLINE STANDARD
  const metodo = id ? "PUT" : "POST";
  const urlEndpoint = id ? `/building/${id}` : "/building";
  console.log("📦 ENVIANDO ALTA DE EDIFICIO:", payload);
  
  try {
    const res = await apiFetch(urlEndpoint, {
      method: metodo,
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      // 🌟 CAMBIO: Se usa mostrarAviso en lugar de alert
      mostrarAviso("Edificio guardado exitosamente", "success");
      if (typeof preCargarBaseDatosEnMemoria === "function") await preCargarBaseDatosEnMemoria();
      
      const userRole = localStorage.getItem("role") || "predi";
      if (userRole === "admin") {
        abrirVista("dashboardView");
        if (typeof cargarEdificios === "function") cargarEdificios();
      } else {
        cancelarEdificioMovil();
      }
    } else {
      const data = await res.json().catch(() => ({}));
      // 🌟 CAMBIO: Se usa mostrarAviso en lugar de alert
      mostrarAviso("Error: " + (data.message || "Error desconocido en el servidor"), "error");
    }
  } catch (err) {
    console.error("Error crítico al guardar, respaldando en local por seguridad:", err);
    guardarEnMochilaLocal("edificios_pendientes", { ...payload, _id: id, esModificacionLocal: !!id });
    // 🌟 CAMBIO: Se usa mostrarAviso en lugar de alert
    mostrarAviso("Problema de red. Resguardado en el almacenamiento local.", "warning");
    cancelarEdificioMovil();
  }
}

// =========================================================================
// 🪟 CONTROLADORES DE MODALES: REPORTES DE PROBLEMAS / INCIDENCIAS
// =========================================================================

/** * 1. ENRUTADOR DE ACCESO GLOBAL */
function abrirReporte() { 
  if (!window.currentBuildingId) {
    // 🌟 CAMBIO: Se usa mostrarAviso en lugar de alert
    mostrarAviso("Debe seleccionar o buscar un edificio antes de reportar un problema.", "warning");
    return;
  }
  console.log("📋 Abriendo pasarela de incidencias críticas...");
  
  const modal = document.getElementById("modalReporte");
  if (modal) modal.style.setProperty("display", "flex", "important");
  
  const descProblemaInput = document.getElementById("descProblema");
  if (descProblemaInput) {
    descProblemaInput.value = "";
    descProblemaInput.focus();
  }
}

/** * 2. RECEPTOR DE CIERRE DE INTERFAZ */
function cerrarReporte() { 
  const modal = document.getElementById("modalReporte");
  if (modal) modal.style.display = "none";
}

/** * 3. DESPACHADOR CENTRAL DE REPORTES (FLUIDO Y ASÍNCRONO) */
async function enviarReporte() {
  const txtArea = document.getElementById("descProblema");
  const descripcion = txtArea ? txtArea.value.trim() : "";
  
  const inputNombre = document.getElementById("edit_nombre_reporta");
  const nombreReporta = inputNombre ? inputNombre.value.trim() : "";
  
  const selectorTipo = document.getElementById("tipoProblema");
  const tipo = selectorTipo ? selectorTipo.value : "Otro";
  
  if (!nombreReporta) {
    // 🌟 CAMBIO: Se usa mostrarAviso en lugar de alert
    mostrarAviso("Por favor, introduce tu nombre para saber quién reporta el problema.", "warning");
    return;
  }
  if (!descripcion) {
    // 🌟 CAMBIO: Se usa mostrarAviso en lugar de alert
    mostrarAviso("Por favor, escribe los detalles del problema antes de enviar.", "warning");
    return;
  }
  
  let idEdificioLimpia = window.currentBuildingId;
  if (window.currentBuildingId && typeof window.currentBuildingId === 'object') {
    idEdificioLimpia = window.currentBuildingId._id || window.currentBuildingId.id;
  }
  if (!idEdificioLimpia || idEdificioLimpia === "[object Object]") {
    // 🌟 CAMBIO: Se usa mostrarAviso en lugar de alert
    mostrarAviso("Error local: No se pudo identificar el edificio actual. Intenta recargar la página.", "error");
    return;
  }
  
  const deptoId = window.departamentoEnFoco ? window.departamentoEnFoco._id : (typeof currentDept !== 'undefined' ? currentDept?._id : null);
  const deptoNum = window.departamentoEnFoco ? window.departamentoEnFoco.number : (typeof currentDept !== 'undefined' ? currentDept?.number : null);
  
  const datosReporte = {
    buildingId: idEdificioLimpia, 
    departmentId: deptoId,
    departmentNumber: deptoNum, 
    type: tipo,
    description: descripcion,
    reportedBy: nombreReporta, 
    status: "PENDIENTE" 
  };
  
  console.log("🚀 Procesando reporte con ID de edificio:", idEdificioLimpia);
  
  // 🛰️ CASO A: El teléfono está sin conexión a internet
  if (!navigator.onLine) {
    guardarEnMochilaLocal("reportes_pendientes", datosReporte);
    cerrarReporte();
    if (txtArea) txtArea.value = "";
    if (inputNombre) inputNombre.value = ""; 
    // 🌟 CAMBIO: Se usa mostrarAviso en lugar de alert
    mostrarAviso("Guardado localmente (Sin Internet). Se enviará al recuperar señal.", "warning");
    return;
  }
  
  // 💻 CASO B: Transmisión asíncrona optimizada para salida instantánea
  console.log("🚀 Despachando reporte a la red de forma fluida...");
  
  apiFetch("/issues", {
    method: "POST",
    body: JSON.stringify(datosReporte)
  }).then(async (res) => {
    if (res && res.ok) {
      console.log("✅ Reporte de incidencia impactado en el servidor.");
      if (typeof mostrarInfoEdificio === "function") await mostrarInfoEdificio();
    } else {
      console.warn("⚠️ El servidor rechazó el reporte, moviendo a mochila local.");
      guardarEnMochilaLocal("reportes_pendientes", datosReporte);
    }
  }).catch(error => {
    console.error("Error en transmission de reporte de fondo, resguardando:", error);
    guardarEnMochilaLocal("reportes_pendientes", datosReporte);
  });

  // Salida relámpago de la UI (No espera la respuesta de red)
  cerrarReporte();
  if (txtArea) txtArea.value = "";
  if (inputNombre) inputNombre.value = ""; 
  // 🌟 CAMBIO: Se usa mostrarAviso en lugar de alert
  mostrarAviso("Reporte procesado con éxito.", "success");
}

/** * 4. REINICIO COMPORTAMENTAL DE INTERFAZ MÓVIL */
function limpiarVista() {
  if (typeof UI !== 'undefined') {
    if (UI.resultado) UI.resultado.innerHTML = "";
    if (UI.infoEdificio) UI.infoEdificio.style.display = "none";
    if (UI.reportBtn) UI.reportBtn.style.display = "none";
    if (UI.btnNuevoEdificio) UI.btnNuevoEdificio.style.display = "none";
  } else {
    const res = document.getElementById("resultado");
    const info = document.getElementById("infoEdificio");
    const btnN = document.getElementById("btnNuevoEdificio");
    if (res) res.innerHTML = "";
    if (info) info.style.display = "none";
    if (btnN) btnN.style.display = "none";
  }
  
  const botonera = document.getElementById("botoneraVotacion");
  if (botonera) botonera.style.display = "none";
  
  const nota = document.getElementById("nota");
  if (nota) nota.style.display = "none";
  
  const btnSiguiente = document.getElementById("btnSiguiente");
  if (btnSiguiente) {
    btnSiguiente.style.visibility = "hidden";
    btnSiguiente.style.display = "none";
  }
  
  document.getElementById("btnOk")?.classList.remove("seleccionado");
  document.getElementById("btnNo")?.classList.remove("seleccionado");
  
  if (typeof prediMiniMap !== 'undefined' && prediMiniMap) {
    try {
      prediMiniMap.off();
      prediMiniMap.remove();
    } catch (e) {
      console.warn("Aviso al remover mapa móvil:", e);
    }
    prediMiniMap = null;
  }
  
  window.currentBuildingId = null;
  console.log("🧼 Interfaz del visor móvil restablecida de forma segura (Limpieza completa).");
}

/** * =========================================================================
 * 💼 SECCIÓN 6: PANEL DE ADMINISTRACIÓN, PAGINACIÓN, MODALES Y SUPERADMIN
 * =========================================================================
 * Este módulo unifica el renderizado de la grilla operativa del Administrador,
 * los controles de paginación optimizados en memoria, el control de modales de
 * detalle técnico, auditorías de visitas y la consola avanzada con clave maestra. */


/** * 6.2 CONTROLES DE FLUJO DE PAGINACIÓN ADMIN * Actualiza dinámicamente las etiquetas de estado y procesa el desplazamiento incremental de la grilla. */
function actualizarControlesPaginacion(totalElementos) {
  const totalPaginas = Math.ceil(totalElementos / ELEMENTOS_POR_PAGINA) || 1;
  const infoPagina = document.getElementById("infoPaginacion");
  if (infoPagina) infoPagina.innerText = `Página ${paginaActual} de ${totalPaginas}`;
  const btnAnt = document.getElementById("btnFiltroAnterior");
  const btnSig = document.getElementById("btnFiltroSiguiente");
  if (btnAnt) btnAnt.disabled = (paginaActual === 1);
  if (btnSig) btnSig.disabled = (paginaActual >= totalPaginas);
}
function cambiarPaginaAdmin(direccion) {
  const totalElementos = window.todosLosEdificiosDB ? window.todosLosEdificiosDB.length : 0;
  const totalPaginas = Math.ceil(totalElementos / ELEMENTOS_POR_PAGINA) || 1;
  if (direccion === -1 && paginaActual > 1) {
    paginaActual--;
  } else if (direccion === 1 && paginaActual < totalPaginas) {
    paginaActual++;
  }
  cargarEdificios();
}
/** * 6.3 INTERRUPTOR GENERAL DE MODALES DE AUDITORÍA E HISTORIAL de VISITAS * Controla el despliegue del modal de visitas, limpia sus tarjetas y cierra el panel lateral analítico. */
async function abrirHistorialEdificio(idEdificioOpcional = null) {
  const idEdificio = idEdificioOpcional || (typeof currentBuildingId !== 'undefined' ? currentBuildingId : null);
  const contenedorHistorial = document.getElementById("historialContenido");
  const modal = document.getElementById("modalHistorial");
  if (!idEdificio) {
    // 🌟 CAMBIO: Se usa mostrarAviso en lugar de alert
    mostrarAviso("Primero selecciona un edificio de la lista.", "warning");
    return;
  }
    if (modal) modal.style.display = "flex";
  if (contenedorHistorial) {
    contenedorHistorial.innerHTML = `<p style="color:#71717a; text-align:center; padding:20px; font-size:13px;">Buscando registros...</p>`;
  }
  try {
    const res = await apiFetch(`/building-info/${idEdificio}`);
    if (!res.ok) throw new Error("No se pudo obtener el historial");
    const resData = await res.json();
    const visitas = resData.history || resData.visits || resData.visitas || (resData.lastVisit ? [resData.lastVisit] : []); 
    if (visitas.length === 0) {
      if (contenedorHistorial) {
        contenedorHistorial.innerHTML = `
          <div style="text-align:center; padding:30px; color:#71717a;">
            <p style="font-size:24px; margin-bottom:5px;">📂</p>
            <p style="font-size:13px; margin:0;">Este edificio todavía no tiene visitas registradas.</p>
          </div>`;
      }
      return;
    }
    visitas.sort((a, b) => new Date(b.date || b.fecha || b.createdAt) - new Date(a.date || a.fecha || a.createdAt));
    if (contenedorHistorial) contenedorHistorial.innerHTML = "";
    visitas.forEach(vis => {
      const fechaRaw = vis.date || vis.fecha || vis.createdAt;
      const fechaFormateada = fechaRaw ? new Date(fechaRaw).toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit'
      }) : "Fecha desconocida";
      const depto = vis.department || vis.depto || vis.departamento || "-";
      const estado = vis.status || vis.resultado || "REGISTRADO";
      const nota = vis.notes || vis.nota || "";
      const tieneProblema = vis.hasIssue || vis.issue || vis.problema;
      let badgeColor = "#71717a"; 
      let badgeText = estado;
     if (estado === "ATENDIO" || estado === "ATENDIÓ") {
        badgeColor = "#16a34a"; 
        badgeText = "✔ ATENDIÓ";
      } else if (estado === "NO_EN_CASA" || estado === "NO EN CASA") {
        badgeColor = "#ca8a04"; 
        badgeText = "✕ NO EN CASA";
      }
     const tarjetaVisita = `
        <div style="background: #2c2c2e; border: 1px solid #3a3a3c; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px; text-align: left;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: bold; color: #f4f4f5; font-size: 14px;">🚪 Depto / Unidad: <span style="color:#3b82f6;">${depto}</span></span>
            <span style="font-size: 11px; color: #a1a1aa;">📅 ${fechaFormateada}</span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; margin-top: 2px;">
            <span style="background: ${badgeColor}; color: white; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: bold;">${badgeText}</span>
            ${tieneProblema ? `<span style="background: #ef4444; color: white; font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: bold;">⚠️ PROBLEMA</span>` : ''}
            ${vis.user || vis.usuario ? `<span style="font-size: 11px; color: #71717a;">Por: ${vis.user || vis.usuario}</span>` : ''}
          </div>
          ${nota ? `
          <div style="background: #1c1c1e; border-left: 3px solid #3b82f6; padding: 6px 10px; border-radius: 4px; margin-top: 4px;">
            <p style="margin: 0; font-size: 12px; color: #d4d4d8; font-style: italic;">" ${nota} "</p>
          </div>
          ` : ''}
        </div>
      `;
      if (contenedorHistorial) contenedorHistorial.insertAdjacentHTML("beforeend", tarjetaVisita);
    });
  } catch (error) {
    console.error("Error cargando historial:", error);
    if (contenedorHistorial) {
      contenedorHistorial.innerHTML = `<p style="color:#ef4444; text-align:center; padding:20px; font-size:13px;">Error al conectar con el servidor para traer el historial.</p>`;
    }
  }
}
function cerrarHistorial() {
  const modal = document.getElementById("modalHistorial");
  if (modal) modal.style.display = "none";
}
function cerrarDetalleAdmin() {
  const panel = document.getElementById("panelDetalleEdificio") || document.getElementById("panelDetalleAdmin");
  if (panel) panel.style.display = "none";
  if (window.miniMapaAdminInstance) {
    try {
      window.miniMapaAdminInstance.off();
      window.miniMapaAdminInstance.remove();
    } catch (e) { console.warn("Error apagando miniMapaAdminInstance:", e); }
    window.miniMapaAdminInstance = null;
  }
}

/**
 * =========================================================================
 * 🔐 SECCIÓN 6.4 & 6.5: GESTIÓN DE ACCESO, CONSOLA Y ENTORNO SUPERADMIN
 * =========================================================================
 */

function verificarAccesoSuperAdmin() {
  const claveInput = document.getElementById("superAdminKey")?.value.trim();
  if (claveInput === "2414") {
    window.superAdminAutenticado = true;
    mostrarAviso("Acceso de SuperAdmin Autorizado. Abriendo panel avanzado...", "success");
    if (document.getElementById("superAdminKey")) document.getElementById("superAdminKey").value = "";
    abrirVista("superAdminView");
    window.superAdminPaginaActual = 1;
    ejecutarFiltroSuperAdmin();
  } else {
    mostrarAviso("Clave maestra incorrecta. Intento denegado.", "error");
  }
}

function abrirAccesoSuperAdmin() {
  const inputClave = document.getElementById('inputClaveMaestra');
  if (inputClave) inputClave.value = '';
  
  const modal = document.getElementById('modalClaveSuperAdmin');
  if (modal) {
    modal.style.display = 'flex';
  }
  
  setTimeout(() => {
    if (inputClave) inputClave.focus();
  }, 100);
}

function cerrarModalClave() {
  const modal = document.getElementById('modalClaveSuperAdmin');
  if (modal) {
    modal.style.display = 'none';
  }
}

function procesarClaveSuperAdmin() {
    const inputClave = document.getElementById('inputClaveMaestra');
    if (!inputClave) return;
    
    const clave = inputClave.value;
    
    if (clave) {
        if (clave === "2414") {
            cerrarModalClave();
            window.superAdminAutenticado = true;
            
            mostrarAviso("Acceso de SuperAdmin Autorizado. Abriendo panel avanzado...", "success");
            abrirVista("superAdminView");
            
            window.superAdminPaginaActual = 1;
            
            // Forzar inicialización de datos para evitar grillas vacías al arrancar
            if (!window.todosLosEdificiosDB || window.todosLosEdificiosDB.length === 0) {
                window.superAdminFiltrados = [];
            } else {
                window.superAdminFiltrados = [...window.todosLosEdificiosDB];
            }
            
            ejecutarFiltroSuperAdmin();
        } else {
            mostrarAviso("Clave maestra incorrecta. Intento denegado.", "error");
            inputClave.value = '';
            inputClave.focus();
        }
    }
}

function ejecutarBusquedaSuperAdmin() {
  const input = document.getElementById("buscadorSuperAdmin");
  const valor = input ? input.value : "";
  const query = valor.toLowerCase().trim();
  
  if (query === "") {
    window.superAdminFiltrados = window.todosLosEdificiosDB ? [...window.todosLosEdificiosDB] : [];
  } else {
    window.superAdminFiltrados = (window.todosLosEdificiosDB || []).filter(b => {
      const dir = (b.address || b.direccion || "").toLowerCase();
      const nom = (b.name || b.nombre || "").toLowerCase();
      const terr = (b.territory || b.territorio || "").toString();
      return dir.includes(query) || nom.includes(query) || terr.includes(query);
    });
  }
  window.superAdminPaginaActual = 1;
  renderizarTablaSuperAdmin();
}

function ejecutarFiltroSuperAdmin() {
  if (!window.superAdminAutenticado) return;
  const selectorFiltro = document.getElementById("superAdminFiltroEstado")?.value || "TODOS";
  const origenDatos = window.todosLosEdificiosDB || [];
  
  window.superAdminFiltrados = origenDatos.filter(e => {
    const estado = (e.status || e.estado || "Pendiente").toUpperCase();
    if (selectorFiltro === "TODOS") return true;
    if (selectorFiltro === "PROBLEMA") return (estado === "PROBLEMA" || estado === "INCIDENCIA" || !!e.problema || !!e.issue);
    return estado === selectorFiltro;
  });
  
  window.superAdminPaginaActual = 1;
  renderizarTablaSuperAdmin();
}

function renderizarTablaSuperAdmin() {
  const tabla = document.getElementById("tablaSuperAdminCuerpo");
  if (!tabla) return;

  tabla.innerHTML = "";
  const datosSuper = window.superAdminFiltrados || [];
  const totalEdificios = window.todosLosEdificiosDB ? window.todosLosEdificiosDB.length : 0;

  const contadorLabel = document.getElementById("contadorSuperAdmin");
  if (contadorLabel) {
    contadorLabel.innerText = `Mostrando ${datosSuper.length} de ${totalEdificios} edificios reales`;
  }

  if (datosSuper.length === 0) {
    tabla.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#a1a1aa; padding:30px; font-weight:500;">📭 Ningún registro cumple el criterio del filtro seleccionado.</td></tr>`;
    actualizarPaginacionSuperAdmin(0);
    return;
  }

  const inicio = (window.superAdminPaginaActual - 1) * ELEMENTOS_POR_PAGINA;
  const fin = inicio + ELEMENTOS_POR_PAGINA;
  const segmento = datosSuper.slice(inicio, fin);

  segmento.forEach(e => {
    const id = e.id || e._id;
    const fila = document.createElement("tr");
    fila.style.borderBottom = "1px solid #27272a";
    
    const detalleProblema = e.notes || e.problema || (e.issue ? e.issue.description : 'Sin incidencias activas');
    const estadoTexto = (e.status || e.estado || 'Pendiente').toUpperCase();
    
    let badgeColor = "#e2e8f0";
    if(estadoTexto === "PROBLEMA") badgeColor = "#fca5a5";
    if(estadoTexto === "ATENDIO" || estadoTexto === "ATENDIÓ") badgeColor = "#86efac";

    fila.innerHTML = `
      <td style="padding: 14px 16px; color: #ffffff; font-weight: 600;">
        ${e.address || 'Sin Dirección'}
        ${e.name ? `<br><span style="color:#71717a; font-size:12px; font-weight:normal;">${e.name}</span>` : ''}
      </td>
      <td style="padding: 14px 16px; color: #e4e4e7; text-align: center; font-weight: 700;">${e.territory || e.territorio || '-'}</td>
      <td style="padding: 14px 16px; color: #a1a1aa; font-size: 13px; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${detalleProblema}</td>
      <td style="padding: 14px 16px; text-align: center;">
        <span style="color: ${badgeColor}; font-weight: 800; font-size: 12px; letter-spacing: 0.5px;">${estadoTexto}</span>
      </td>
      <td style="padding: 14px 16px; text-align: right;">
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button onclick="verHistorialLogs('${id}')" title="Ver Historial de Logs" style="background: #27272a; border: 1px solid #3f3f46; color: white; padding: 6px 10px; border-radius: 8px; cursor: pointer; transition: background 0.2s;">📜 Logs</button>
          <button onclick="eliminarEdificioDestructivo('${id}')" title="Eliminar permanentemente" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; padding: 6px 10px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: all 0.2s;">🗑️ Borrar</button>
        </div>
      </td>
    `;
    tabla.appendChild(fila);
  });

  actualizarPaginacionSuperAdmin(datosSuper.length);
}

function actualizarPaginacionSuperAdmin(total) {
  const paginas = Math.ceil(total / ELEMENTOS_POR_PAGINA) || 1;
  const label = document.getElementById("infoPaginacionSuper");
  if (label) label.innerText = `Página ${window.superAdminPaginaActual} de ${paginas}`;
  
  const btnAnt = document.getElementById("btnSuperAnt");
  const btnSig = document.getElementById("btnSuperSig");
  
  if (btnAnt) {
    btnAnt.disabled = (window.superAdminPaginaActual === 1);
    btnAnt.style.opacity = (window.superAdminPaginaActual === 1) ? "0.4" : "1";
  }
  if (btnSig) {
    btnSig.disabled = (window.superAdminPaginaActual >= paginas);
    btnSig.style.opacity = (window.superAdminPaginaActual >= paginas) ? "0.4" : "1";
  }
}

function cambiarPaginaSuper(dir) {
  const datosSuper = window.superAdminFiltrados || [];
  const totalPaginas = Math.ceil(datosSuper.length / ELEMENTOS_POR_PAGINA) || 1;
  if (dir === -1 && window.superAdminPaginaActual > 1) window.superAdminPaginaActual--;
  if (dir === 1 && window.superAdminPaginaActual < totalPaginas) window.superAdminPaginaActual++;
  renderizarTablaSuperAdmin();
}

// Escuchador global para la tecla Enter en el input de la clave
document.addEventListener('DOMContentLoaded', () => {
  const inputClave = document.getElementById('inputClaveMaestra');
  if (inputClave) {
    inputClave.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        procesarClaveSuperAdmin();
      }
    });
  }
});
/** * 6.6 ACCIONES CRÍTICAS EN CASCADA Y HISTÓRICOS DE LOGS
 * Ejecuta la eliminación física irreversible en el backend y parsea las trazas de auditoría profunda. */
async function eliminarEdificioDestructivo(id) {
  // Se mantiene el confirm nativo como freno de mano de seguridad extrema antes de borrar
  const confirmacion = confirm("⚠️ ADVERTENCIA CRÍTICA ⚠️\n\n¿Está absolutamente seguro de eliminar permanentemente este edificio? Esta acción borrará de forma irreversible el historial de visitas, coordenadas y reportes asociados.");
  if (!confirmacion) return;

  try {
    const res = await apiFetch(`/admin/buildings/${id}`, { method: "DELETE" });
    if (res.ok) {
      // 🌟 CAMBIO: Aviso estético en rojo/borrado con icono de tacho
      mostrarAviso("El registro ha sido eliminado físicamente de la base de datos.", "error");
      if (typeof preCargarBaseDatosEnMemoria === 'function') await preCargarBaseDatosEnMemoria();
      ejecutarFiltroSuperAdmin();
      if (typeof cargarEdificios === "function") cargarEdificios();
    } else {
      // 🌟 CAMBIO: Aviso estético de error
      mostrarAviso("Error: El servidor denegó la solicitud de borrado.", "error");
    }
  } catch (err) {
    console.error("Error crítico en cascada de borrado:", err);
    // 🌟 CAMBIO: Aviso estético de error
    mostrarAviso("Falló la comunicación destructiva con el backend.", "error");
  }
}

async function verHistorialLogs(id) {
  try {
    const res = await apiFetch(`/admin/buildings/${id}/logs`);
    if (res.ok) {
      const logs = await res.json();
      const formatLogs = logs.length > 0 
        ? logs.map(l => `• [${l.fecha || 'Fecha ausente'}] - ${l.usuario || 'Sistema'}: ${l.accion || 'Modificación'}`).join("\n")
        : "• No se registran logs históricos previos para este elemento.";
      
      mostrarAviso(`📜 AUDITORÍA (ID: ${id}):\n${formatLogs}`, "success");
    } else {
    mostrarAviso("No se pudo recuperar el historial de auditoría.", "error");
    }
  } catch (err) {
    console.error("Falla en petición de logs:", err);
   
    mostrarAviso("Error de red al solicitar los logs.", "error");
  }
}
/** * 6.7 VISUALIZADOR DE DETALLES, ALERTAS HISTORIAL Y MINI-MAPA INDEPENDIENTE (ADMIN)
 * Consume la información extendida desde el backend y despliega el panel técnico. */
async function verDetalleEdificioAdmin(buildingId) {
  // Guardamos el ID en la variable global para que la app sepa qué edificio está en pantalla
  currentBuildingId = buildingId; 
  const panel = document.getElementById("panelDetalleEdificio");
  if (!panel) {
    console.warn("⚠️ No se encontró el contenedor 'panelDetalleEdificio' en el HTML.");
    return;
  }
  
  panel.style.display = "block";
  panel.innerHTML = `<p style="text-align:center; color:gray; padding:20px;">Cargando historial y detalles...</p>`;
  
  try {
    const res = await apiFetch(`/building-info/${buildingId}`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    const b = data.building;
    if (!b) throw new Error("No se recibieron datos válidos del edificio.");
    
    // Identificador único real del edificio
    const idRealEdificio = b._id || b.id || buildingId;

    let cartelNuevoAdminHtml = "";
    if (b.createdAt || b.fechaCreacion) {
      const fechaCreacion = new Date(b.createdAt || b.fechaCreacion);
      const hoy = new Date();
      const diferenciaDias = Math.floor((hoy - fechaCreacion) / (1000 * 60 * 60 * 24));
      if (diferenciaDias <= 30) {
        const fechaFormateada = fechaCreacion.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        cartelNuevoAdminHtml = `
          <div style="background:#064e3b; border: 1px solid #059669; color:#a7f3d0; padding:10px; border-radius:12px; margin-bottom:12px; font-size:14px; font-weight:600;">
            ✨ Edificio nuevo: ingresado al sistema el ${fechaFormateada}
          </div>
        `;
      }
    }
    
    let alertaHtml = "";
    if (data.issue) {
      alertaHtml = `
        <div style="position: absolute; bottom: 12px; right: 16px; font-size: 20px; filter: drop-shadow(0 0 4px rgba(239,68,68,0.5));" title="Problema detectado por el Admin">
          ⚠️
        </div>
      `;
    }

    // 🛠️ COMPONENTE DINÁMICO DE AUDITORÍA: Si está en la pestaña "Por Auditar", preparamos los botones ejecutivos
    let botonesAuditoriaHtml = "";
    if (typeof modoListaAdmin !== 'undefined' && modoListaAdmin === "auditoria") {
      botonesAuditoriaHtml = `
        <div style="margin-top: 15px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid #27272a; padding-top: 15px;">
          <button onclick="procesarVerificacionEdificio('${idRealEdificio}', true)" style="background: #22c55e; color: white; border: none; padding: 12px; font-weight: bold; border-radius: 8px; cursor: pointer; font-size:13px; width: 100%; transition: background 0.2s;">
            🟢 Aprobar e Integrar al Sistema
          </button>
          <button onclick="procesarVerificacionEdificio('${idRealEdificio}', false)" style="background: #18181b; color: #ef4444; border: 1px solid #ef4444; padding: 10px; font-weight: bold; border-radius: 8px; cursor: pointer; font-size:13px; width: 100%; transition: background 0.2s;">
            ✕ Rechazar Registro
          </button>
        </div>
      `;
    }

    // Inyección atómica de la estructura limpia en el panel de detalles
    panel.innerHTML = `
      ${cartelNuevoAdminHtml}
      ${alertaHtml}
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px; gap: 10px;">
        <div>
          <h3 style="margin:0; color:white; font-size:22px;">${b.address || "Sin Dirección"}</h3>
          <p style="color:gray; margin:2px 0;">${b.address2 || ""}</p>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button class="secondary" style="width:auto; min-height:38px; padding:6px 12px; font-size:13px; border-radius:8px; white-space:nowrap; background:#1e293b; color:#3b82f6; border-color:#1e3a8a;" onclick="abrirHistorialEdificio()">📜 Historial</button>
          <button class="secondary" style="width:auto; min-height:38px; padding:6px 12px; font-size:13px; border-radius:8px; white-space:nowrap;" onclick="abrirEditorEdificio('${idRealEdificio}')">✏️ Editar</button>
        </div>
      </div>
      
      <div style="display: flex; gap: 14px; align-items: stretch; margin-bottom: 15px;">
        <div style="flex: 1; display: grid; grid-template-columns: 1fr; gap: 6px; font-size: 13px; background:#252525; padding:12px; border-radius:12px; color: #e4e4e7;">
          <div>🏢 <b>Nombre:</b> ${b.name || "-"}</div>
          <div>🗺️ <b>Territorio:</b> ${b.territory || b.territorio || "-"}</div>
          <div>🔢 <b>Pisos:</b> ${b.floors || 0}</div>
          <div>🚪 <b>Deptos/Piso:</b> ${b.unitsPerFloor || 0}</div>
          <div>🌱 <b>PB:</b> ${b.hasGroundFloor ? "Sí" : "No"} | 🛎️ <b>Portero:</b> ${b.hasDoorman ? "Sí" : "No"}</div>
        </div>
        <div id="contenedorMapaAdminSquare" style="width: 140px; height: 140px; flex-shrink: 0; position: relative; overflow: hidden; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
          <div id="miniMapaDetalle" style="width: 140px; height: 140px; border-radius: 12px; background:#181818; border: none;"></div>
        </div>
      </div>
      
      <h4 style="margin:10px 0 5px; color:#2196F3; font-size:16px;">🕒 Historial de Visitas e Información</h4>
      <div style="font-size:14px; background:#181818; padding:10px; border-radius:10px; max-height:180px; overflow-y:auto; border:1px solid #2b2b2b;">
        <p style="margin:0; color:#bdbdbd;">Última visita registrada: ${data.lastVisit ? new Date(data.lastVisit.date).toLocaleDateString('es-AR') : "Nunca"}</p>
        ${b.description ? `<p style="margin-top:8px; color:gray; font-style: italic;"><b>Descripción interna:</b> ${b.description}</p>` : ""}
      </div>

      ${botonesAuditoriaHtml}
    `;
    
    // =========================================================================
    // RENDERIZADO DEL MINI-MAPA DE LEAFLET
    // =========================================================================
    if (typeof miTemporizadorMapa !== 'undefined' && miTemporizadorMapa) {
      clearTimeout(miTemporizadorMapa);
    }
    
    miTemporizadorMapa = setTimeout(() => {
      const miMapaReal = (typeof mapaMaestroFullscreenInstance !== 'undefined' && mapaMaestroFullscreenInstance !== null) ? mapaMaestroFullscreenInstance :
                         (typeof mapaGeneral !== 'undefined' && mapaGeneral !== null) ? mapaGeneral : 
                         (typeof leafletMap !== 'undefined' && leafletMap !== null) ? leafletMap : 
                         (typeof map !== 'undefined' && map !== null) ? map : null;
      const latValida = parseFloat(b.latitude);
      const lngValida = parseFloat(b.longitude);
      const tieneCoordenadas = !isNaN(latValida) && !isNaN(lngValida) && isFinite(latValida) && latValida !== 0;

      if (typeof miniMapaAdminInstance !== 'undefined' && miniMapaAdminInstance !== null) {
        try { miniMapaAdminInstance.remove(); } catch (e) { console.warn("Error limpiando mini-mapa anterior:", e); }
        miniMapaAdminInstance = null;
      }
      
      if (tieneCoordenadas) {
        setTimeout(() => {
          try {
            miniMapaAdminInstance = L.map('miniMapaDetalle', {
              center: [latValida, lngValida],
              zoom: 16,
              zoomControl: false,
              attributionControl: false,
              dragging: false,
              touchZoom: false,
              doubleClickZoom: false,
              scrollWheelZoom: false,
              boxZoom: false,
              keyboard: false
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(miniMapaAdminInstance);
            L.marker([latValida, lngValida]).addTo(miniMapaAdminInstance);
            miniMapaAdminInstance.invalidateSize();
          } catch (miniMapError) {
            console.error("Error creando el mini-mapa independiente:", miniMapError);
          }
        }, 50);
      } else {
        const minMapDiv = document.getElementById("miniMapaDetalle");
        if (minMapDiv) minMapDiv.innerHTML = `<p style="color:#71717a; font-size:11px; text-align:center; padding-top:55px; margin:0;">Falta geolocalización</p>`;
      }

      if (miMapaReal) {
        try { miMapaReal.invalidateSize({ animate: false }); } catch(e){}
        if (tieneCoordenadas) {
          try { miMapaReal.setView([latValida, lngValida], 16); } catch(e){}
        } else if ((b.territory || b.territorio) && typeof misTerritoriosGeoJSON !== 'undefined' && misTerritoriosGeoJSON !== null) {
          try {
            const numTerritorio = b.territory || b.territorio;
            let capaGeoJSONAdmin = L.geoJSON(misTerritoriosGeoJSON, {
              filter: function(feature) {
                const numeroTerritorio = feature.properties && (feature.properties.name || feature.properties.Territorio_N);
                return String(numeroTerritorio) === String(numTerritorio);
              }
            });

            if (capaGeoJSONAdmin.getLayers().length > 0) {
              miMapaReal.fitBounds(capaGeoJSONAdmin.getBounds(), { padding: [25, 25], maxZoom: 16 });
            }
          } catch (geoError) {
            console.warn("Fallo al encuadrar territorio en el mapa principal:", geoError);
          }
        }
      }
    }, 100);

  } catch (error) {
    console.error("Error al cargar detalles del edificio:", error);
    panel.innerHTML = `<p style="color:#f87171; text-align:center; padding: 20px;">⚠️ Error al conectar con los detalles del edificio.</p>`;
  }
}
/**  * ⚠️ SECCIÓN 6.8: PANEL PREMIUM DE GESTIÓN DE INCIDENCIAS (DOS COLUMNAS ASÍNCRONAS) 
 * Módulo unificado para la auditoría de reportes críticos de campo. Divide la
 * interfaz en un panel izquierdo de tarjetas reactivas y un visor analítico derecho. */

// Variable global para almacenar los problemas descargados
let listaProblemasGlobal = [];

/**
 * 💻 Admin: Inicializa la estructura con Header en 3 partes y Layout Premium
 */
async function verProblemas() {
  const probView = document.getElementById("problemasView");
  if (!probView) return;

  // 1. HEADER INTEGRADO EN UNA SOLA LÍNEA (3 PARTES: Izquierda, Centro, Derecha)
  probView.innerHTML = `
    <div style="padding: 20px; max-width: 1400px; margin: 0 auto;">
      <div style="display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 20px; margin-bottom: 25px; background: #18181b; border: 1px solid #27272a; padding: 12px 20px; border-radius: 16px;">
        <div>
          <button class="secondary backModern" style="margin:0; padding: 8px 16px; font-size:13px;" onclick="abrirVista('dashboardView')">← Volver</button>
        </div>
        <div style="text-align: center;">
          <h2 style="margin:0; font-size:22px; color:white; font-weight:700; letter-spacing:-0.5px;">⚠️ Gestión de Incidentes y Reportes</h2>
        </div>
        <div style="background:#27272a; border:1px solid #3f3f46; padding: 6px 14px; border-radius:10px; display:flex; align-items:center; gap:8px;">
          <span style="font-size:11px; color:#a1a1aa; font-weight:600; text-transform:uppercase;">Activos</span>
          <b id="contadorProblemasAdmin" style="font-size:16px; color:#ef4444;">-</b>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1.3fr; gap: 20px; min-height: 70vh;" class="admin-grid-layout">
        <!-- Columna Izquierda: Listado de Alertas -->
        <div style="background:#18181b; border:1px solid #27272a; border-radius:16px; padding:15px; display:flex; flex-direction:column; gap:10px; max-height:75vh; overflow-y:auto;" id="listaReportesAdminContenedor">
          <p style='padding:15px; color:gray; text-align:center;'>Cargando reportes en tiempo real...</p>
        </div>
        <!-- Columna Derecha: Panel de Auditoría Integrado -->
        <div style="background:#18181b; border:1px solid #27272a; border-radius:16px; padding:20px; position:sticky; top:20px; max-height:75vh; overflow-y:auto;" id="panelDetalleProblemaAdmin">
          <div style="text-align:center; color:#71717a; margin-top:150px;">
            <span style="font-size:48px; display:block; margin-bottom:10px;">🔍</span>
            Selecciona un reporte de la lista para auditar la ficha del edificio, ver ubicación en mapa y aplicar resoluciones.
          </div>
        </div>
      </div>
    </div>
  `;

  try {
    const res = await apiFetch("/issues");
    if (!res || !res.ok) throw new Error("Falla en respuesta de red");
    
    listaProblemasGlobal = await res.json();
    const contenedorLista = document.getElementById("listaReportesAdminContenedor");
    const contador = document.getElementById("contadorProblemasAdmin");
    
    if (contador) contador.innerText = listaProblemasGlobal.length;
    if (!contenedorLista) return;

    if (!listaProblemasGlobal.length) {
      contenedorLista.innerHTML = "<p style='padding:30px; color:#a1a1aa; text-align:center; font-size:14px;'>🎉 ¡Excelente! No hay problemas pendientes en ningún edificio.</p>";
      return;
    }

    contenedorLista.innerHTML = "";
    listaProblemasGlobal.forEach((i, index) => {
      let colorTipo = "#ef4444"; 
      if (i.type?.toLowerCase().includes("dato")) colorTipo = "#eab308";
      if (i.type?.toLowerCase().includes("portero")) colorTipo = "#3b82f6";

      let estadoBadge = `<span style="background:#3f1f1f; color:#f87171; border:1px solid #ef4444; padding:2px 6px; border-radius:6px; font-size:10px; font-weight:600;">PENDIENTE</span>`;
      if (i.status === "EN_PROCESO") {
        estadoBadge = `<span style="background:#3b2e16; color:#fde047; border:1px solid #eab308; padding:2px 6px; border-radius:6px; font-size:10px; font-weight:600;">EN PROCESO</span>`;
      }

      let textoEdificio = "No asignado";
      if (i.buildingId) {
        if (typeof i.buildingId === "object" && i.buildingId.address) {
          textoEdificio = i.buildingId.address;
        } else if (typeof i.buildingId === "string" && i.buildingId !== "[object Object]") {
          textoEdificio = "ID: " + i.buildingId;
        } else {
          textoEdificio = "Edificio no reconocido";
        }
      }

      const card = document.createElement("div");
      card.className = "edificio-item-lista";
      card.style.cssText = "background:#27272a; border:1px solid #3f3f46; padding:14px; border-radius:12px; cursor:pointer; transition:all 0.2s; display:block; margin-bottom:4px;";
      card.onclick = () => verDetalleIncidenteAdmin(i, index);

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; width:100%;">
          <div style="flex-grow:1; min-width:0;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap;">
              <b style="color:${colorTipo}; font-size:14px;">⚠️ ${i.type || "Incidente"}</b>
              ${estadoBadge}
            </div>
            <span style="color:white; font-weight:600; font-size:12px; display:block; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📍 ${textoEdificio}</span>
            <p style="margin:6px 0 0 0; color:#d4d4d8; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${i.description || "Sin descripción"}
            </p>
            <div style="margin-top:10px;">
              <button onclick="event.stopPropagation(); eliminarReporteRotoDirecto(event, '${i._id || i.id}')" style="background:#451a1a; color:#f87171; border:1px solid #ef4444; padding:4px 10px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer;">
                🗑️ Eliminar Reporte
              </button>
            </div>
          </div>
          <span style="color:#71717a; font-weight:bold; align-self:center; font-size:16px; padding-left:4px;">→</span>
        </div>
      `;
      contenedorLista.appendChild(card);
    });
  } catch (error) {
    console.error("Error al listar reportes:", error);
  }
}

/**
 * 💻 Admin: Renderiza la columna derecha con Ficha Técnica Expandida, Mini-Mapa y Trilogía de botones
 */
async function verDetalleIncidenteAdmin(incidente, index) {
  const panel = document.getElementById("panelDetalleProblemaAdmin");
  if (!panel) return;

  const idIncidente = incidente._id || incidente.id;
  const targetBuildingId = incidente.buildingId?._id || incidente.buildingId?.id || incidente.buildingId;
  
  panel.innerHTML = `<p style="text-align:center; color:gray; padding:20px;">Vinculando base de datos estructural del edificio...</p>`;

  // Variables por defecto por si el fetch falla o no hay datos extendidos
  let b = { address: "Dirección de prueba", floors: 0, unitsPerFloor: 0 };
  let lastVisitDate = "Nunca";

  try {
    const res = await apiFetch(`/building-info/${targetBuildingId}`);
    if (res && res.ok) {
      const data = await res.json();
      if (data.building) b = data.building;
      if (data.lastVisit) lastVisitDate = new Date(data.lastVisit.date).toLocaleDateString('es-AR');
    }
  } catch (err) {
    console.warn("No se pudo traer la info extendida, usando datos del incidente:", err);
    if (typeof incidente.buildingId === "object") b = incidente.buildingId;
  }

  const deptoNum = incidente.departmentNumber || incidente.depto || "-";
  const informante = incidente.reportedBy || "Operador de campo";

  // 2. DISEÑO DE PARTE SUPERIOR COMPACTO: FICHA INTEGRADA + MINI MAPA ESTÁTICO
  panel.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:16px;">
      
      <div style="display: flex; gap: 14px; align-items: stretch; border-bottom: 1px solid #27272a; padding-bottom: 16px;">
        <div style="flex: 1; min-width: 0;">
          <span style="font-size:10px; color:#3b82f6; text-transform:uppercase; font-weight:800; letter-spacing:0.5px;">Ficha Técnica de Inmueble</span>
          <h3 style="margin:2px 0 6px 0; color:white; font-size:18px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📍 ${b.address || b.direccion || "Sin dirección"}</h3>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 12px; background:#252525; padding:10px; border-radius:10px; color: #e4e4e7;">
            <div>🏢 <b>Nombre:</b> ${b.name || "-"}</div>
            <div>🗺️ <b>Territorio:</b> ${b.territory || b.territorio || "-"}</div>
            <div>🔢 <b>Pisos:</b> ${b.floors || 0}</div>
            <div>🚪 <b>Deptos/Piso:</b> ${b.unitsPerFloor || 0}</div>
            <div style="grid-column: span 2; font-size:11px; color:#a1a1aa; border-top:1px solid #3f3f46; margin-top:4px; padding-top:4px;">🌱 PB: ${b.hasGroundFloor ? "Sí" : "No"} | 🛎️ Portero: ${b.hasDoorman ? "Sí" : "No"}</div>
          </div>
        </div>
        <!-- Contenedor del Mini-Mapa Estático Dedicado -->
        <div style="width: 120px; height: 120px; flex-shrink: 0; position: relative; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); background:#141416;">
          <div id="miniMapaIncidenteAdmin" style="width: 120px; height: 120px; border-radius: 12px;"></div>
        </div>
      </div>

      <!-- Información del Incidente Activo -->
      <div style="background:#1e1e22; border: 1px solid #27272a; padding:12px; border-radius:12px; display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:12px; color:#e4e4e7;">
        <div>🚪 <b>Unidad/Depto Afectado:</b> <span style="color:#fcd34d;">${deptoNum}</span></div>
        <div>👤 <b>Reportado por:</b> ${informante}</div>
        <div style="grid-column: span 2;">⚠️ <b>Naturaleza del Error:</b> <span style="color:#ef4444; font-weight:700;">${incidente.type || "General"}</span></div>
      </div>

      <div>
        <h4 style="margin:0 0 4px 0; color:#a1a1aa; font-size:12px; text-transform:uppercase;">Descripción de Alerta:</h4>
        <div style="background:#141416; border-left:3px solid #ef4444; padding:10px 14px; border-radius:8px; color:#d4d4d8; font-size:13px; font-style:italic;">
          "${incidente.description || 'Sin comentarios adicionales.'}"
        </div>
      </div>

      <!-- Selector de Estados Intermedios -->
      <div style="display:flex; align-items:center; gap:10px; background:#141416; padding:8px 12px; border-radius:10px; border:1px solid #27272a;">
        <label style="font-size:12px; color:#a1a1aa; font-weight:600;">Estado Operativo:</label>
        <select onchange="cambiarEstadoIncidente('${idIncidente}', this.value)" style="background:#27272a; color:white; border:1px solid #3f3f46; padding:4px 8px; border-radius:6px; font-size:12px; cursor:pointer; flex-grow:1;">
          <option value="PENDIENTE" ${incidente.status === 'PENDIENTE' ? 'selected' : ''}>⏳ PENDIENTE</option>
          <option value="EN_PROCESO" ${incidente.status === 'EN_PROCESO' ? 'selected' : ''}>🛠️ EN PROCESO</option>
        </select>
      </div>

      <!-- 3 y 5. BARRA INFERIOR RE-ESTRUCTURADA (TRILOGÍA DE ACCIONES ALINEADAS) -->
      <div style="display: flex; gap: 8px; margin-top: auto; border-top: 1px solid #27272a; padding-top:14px;">
        <!-- Botón 1: Texto corto y limpio -->
        <button onclick="resolverIncidenteCompleto('${idIncidente}')" style="background:#16a34a; color:white; border:none; padding:10px 16px; border-radius:10px; font-size:13px; font-weight:700; cursor:pointer; flex: 1.2; display:flex; align-items:center; justify-content:center; gap:4px; box-shadow:0 4px 12px rgba(22,163,74,0.2);">
          ✔ Resolver
        </button>
        <!-- Botón 2: Acceso directo al Historial de visitas -->
        <button onclick="abrirHistorialEdificio('${targetBuildingId}')" style="background:#27272a; border:1px solid #3f3f46; color:white; padding:10px 14px; border-radius:10px; font-size:12px; font-weight:600; cursor:pointer; flex: 1; display:flex; align-items:center; justify-content:center; gap:4px;">
          📜 Historial
        </button>
        <!-- Botón 3: NUEVO - Acceso directo a edición estructural del Edificio -->
        <button onclick="abrirEditorEdificio('${targetBuildingId}')" style="background:#1e293b; border:1px solid #3b82f6; color:#3b82f6; padding:10px 14px; border-radius:10px; font-size:12px; font-weight:600; cursor:pointer; flex: 1; display:flex; align-items:center; justify-content:center; gap:4px;">
          ✏️ Editar Edif.
        </button>
      </div>

    </div>
  `;

  // Renderizado Automático del Mini-Mapa Estático del Incidente
  setTimeout(() => {
    const latValida = parseFloat(b.latitude || b.lat);
    const lngValida = parseFloat(b.longitude || b.lng);
    const tieneCoordenadas = !isNaN(latValida) && !isNaN(lngValida) && latValida !== 0;

    const mapDiv = document.getElementById("miniMapaIncidenteAdmin");
    if (!mapDiv) return;

    if (tieneCoordenadas) {
      try {
        const miniMap = L.map('miniMapaIncidenteAdmin', {
          center: [latValida, lngValida],
          zoom: 15,
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          touchZoom: false,
          doubleClickZoom: false,
          scrollWheelZoom: false
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(miniMap);
        L.marker([latValida, lngValida]).addTo(miniMap);
        miniMap.invalidateSize();
      } catch (e) {
        console.warn("Error al renderizar Leaflet en incidente:", e);
      }
    } else {
      mapDiv.innerHTML = `<div style="color:#71717a; font-size:10px; text-align:center; padding-top:45px; font-weight:600;">⚠️ Sin mapa<br>(Falta Geo)</div>`;
    }
  }, 100);
}

// Variable global temporal para el seguro del botón de eliminación directa
let idReporteRotoBorrando = null;

/** * 🛑 ACCIÓN DE SEGURO: Eliminación permanente física de reportes dañados o viejos
 * SISTEMA: Doble click estético integrado con detención de propagación (Chau cartel gris) */
async function eliminarReporteRotoDirecto(event, id) {
  // OBLIGATORIO: Frenamos el click para que no se active la tarjeta de la lista izquierda
  if (event && typeof event.stopPropagation === "function") {
    event.stopPropagation();
  }

  // 🔍 Buscamos dinámicamente el botón rojo de la tarjeta usando su atributo onclick
  const botonEliminar = document.querySelector(`button[onclick*="eliminarReporteRotoDirecto"][onclick*="${id}"]`);

  // 🛡️ PASO 1: Primer click - Activamos el modo confirmación en el botón
  if (idReporteRotoBorrando !== id) {
    idReporteRotoBorrando = id;
    
    if (botonEliminar) {
      // Guardamos el texto original por las dudas
      botonEliminar.dataset.originalText = botonEliminar.innerHTML;
      botonEliminar.style.background = "#dc2626"; // Rojo vivo de alerta
      botonEliminar.style.borderColor = "#f87171";
      botonEliminar.innerHTML = "⚠️ ¿Seguro? Eliminar";
    }

    // Seguro de 4 segundos: Si no confirma, vuelve a la normalidad solo
    setTimeout(() => {
      if (idReporteRotoBorrando === id) {
        idReporteRotoBorrando = null;
        if (botonEliminar) {
          botonEliminar.style.background = ""; // Reestablece el CSS original
          botonEliminar.style.borderColor = "";
          botonEliminar.innerHTML = botonEliminar.dataset.originalText || "🗑️ Eliminar Reporte";
        }
      }
    }, 4000);
    
    return; // Detenemos la ejecución hasta el próximo click
  }

  // 🚀 PASO 2: Segundo click - Confirmado el borrado definitivo
  idReporteRotoBorrando = null; // Reseteamos el seguro
  
  if (botonEliminar) {
    botonEliminar.innerHTML = "⏳ Eliminando...";
    botonEliminar.disabled = true;
  }

  try {
    const res = await apiFetch(`/issues/${id}`, { method: "DELETE" });
    if (res && res.ok) {
      // Mensaje de éxito Premium estilizado abajo
      mostrarAviso("🗑️ Reporte destruido y eliminado completamente del sistema.", "success");
      
      // Actualizamos fluidamente la lista izquierda
      await verProblemas();
      
      // Devolvemos la columna derecha al estado inicial instructivo
      const panel = document.getElementById("panelDetalleProblemaAdmin");
      if (panel) {
        panel.innerHTML = `
          <div style="text-align:center; color:#71717a; margin-top:120px;">
            <span style="font-size:48px; display:block; margin-bottom:10px;">🔍</span>
            Selecciona un reporte de la lista para auditar la ficha del edificio, ver ubicación en mapa y aplicar resoluciones.
          </div>
        `;
      }
    } else {
      mostrarAviso("No se pudo procesar la baja en el servidor central.", "error");
      restaurarBotonEliminar(botonEliminar);
    }
  } catch (error) {
    console.error("Error en eliminarReporteRotoDirecto:", error);
    mostrarAviso("Error de comunicación de red al eliminar.", "error");
    restaurarBotonEliminar(botonEliminar);
  }
}

/** * Función auxiliar para devolver el botón a su estado normal si falla el servidor */
function restaurarBotonEliminar(boton) {
  if (boton) {
    boton.disabled = false;
    boton.style.background = "";
    boton.style.borderColor = "";
    boton.innerHTML = boton.dataset.originalText || "🗑️ Eliminar Reporte";
  }
}
/** * 💻 Admin: Cambia el estado intermedio a EN_PROCESO o PENDIENTE en el servidor */

async function cambiarEstadoIncidente(id, nuevoEstado) {
  try {
    const res = await apiFetch(`/issues/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status: nuevoEstado })
    });
    if (res && res.ok) {
      mostrarAviso(`El reporte ahora figura como: "${nuevoEstado.replace('_', ' ')}"`, "success");
      await verProblemas();
    } else {
      mostrarAviso("El servidor no pudo actualizar el estado del problema.", "error");
    }
  } catch (error) {
    console.error("Error en cambiarEstadoIncidente:", error);
    mostrarAviso("Error de comunicación al actualizar estado.", "error");
  }
}

// Variable temporal para el seguro del botón de resolución
let idIncidenteConfirmando = null;

/** * 💻 Admin: Elimina o marca como RESUELTO el problema liberando al edificio
 * SISTEMA: Doble click de confirmación estética (Evita clicks accidentales sin alertas grises) */
async function resolverIncidenteCompleto(id) {
  const botonResolver = document.querySelector(`button[onclick="resolverIncidenteCompleto('${id}')"]`);

  // 🛡️ PASO 1: Si es el primer click, activamos el estado de alerta en el propio botón
  if (idIncidenteConfirmando !== id) {
    idIncidenteConfirmando = id;
    
    if (botonResolver) {
      botonResolver.style.background = "#b91c1c"; // Rojo alerta
      botonResolver.innerHTML = "⚠️ ¿Seguro? Click para Confirmar";
    }

    // Si pasan 4 segundos y no confirma, restauramos el botón automáticamente
    setTimeout(() => {
      if (idIncidenteConfirmando === id) {
        idIncidenteConfirmando = null;
        if (botonResolver) {
          botonResolver.style.background = "#16a34a"; // Vuelve al verde original
          botonResolver.innerHTML = "✔ Resolver";
        }
      }
    }, 4000);
    
    return; // Frenamos acá hasta el segundo click
  }

  // 🚀 PASO 2: Si hace el segundo click, procesamos la resolución real
  idIncidenteConfirmando = null; // Reseteamos el seguro
  
  if (botonResolver) {
    botonResolver.innerHTML = "⏳ Procesando...";
    botonResolver.disabled = true;
  }

  try {
    const res = await apiFetch(`/issues/${id}`, { method: "DELETE" });
    if (res && res.ok) {
      mostrarAviso("¡Incidente solucionado con éxito!", "success");
      await verProblemas();
      const panel = document.getElementById("panelDetalleProblemaAdmin");
      if (panel) {
        panel.innerHTML = `<div style="text-align:center; color:#71717a; margin-top:100px;"><span style="font-size:48px; display:block; margin-bottom:10px;">🔍</span>Selecciona un reporte de la lista para auditar el edificio.</div>`;
      }
    } else {
      // Intento alternativo PUT de contingencia por si el backend está configurado con persistencia de históricos
      const intentoPut = await apiFetch(`/issues/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status: "RESUELTO" })
      });
      if (intentoPut && intentoPut.ok) {
        mostrarAviso("¡Incidente marcado como RESUELTO!", "success");
        await verProblemas();
        const panel = document.getElementById("panelDetalleProblemaAdmin");
        if (panel) {
          panel.innerHTML = `<div style="text-align:center; color:#71717a; margin-top:100px;"><span style="font-size:48px; display:block; margin-bottom:10px;">🔍</span>Selecciona un reporte de la lista para auditar el edificio.</div>`;
        }
      } else {
        mostrarAviso("No se pudo procesar la baja del incidente en el servidor.", "error");
        // Si falla, restauramos el botón
        if (botonResolver) {
          botonResolver.disabled = false;
          botonResolver.style.background = "#16a34a";
          botonResolver.innerHTML = "✔ Resolver";
        }
      }
    }
  } catch (error) {
    console.error("Error en resolverIncidenteCompleto:", error);
    mostrarAviso("Error de conexión al procesar la resolución.", "error");
    if (botonResolver) {
      botonResolver.disabled = false;
      botonResolver.style.background = "#16a34a";
      botonResolver.innerHTML = "✔ Resolver";
    }
  }
}

//=========================================================================
// 🗺️ SECCIÓN 7: MOTOR CARTOGRÁFICO MAESTRO CENTRAL (ADMIN APP - FULLSCREEN)
// =========================================================================
/** * 7.1 INICIALIZACIÓN DE LA ARQUITECTURA DEL MAPA MAESTRO GENERAL FULLSCREEN
 * Levanta el mapa en pantalla completa, inyecta polígonos vectoriales y renderiza
 * automáticamente marcadores (pins) con detalles para los edificios geolocalizados. */
function inicializarMapaGeneralAdministrador() {
  // Apuntamos al nuevo div fullscreen dedicado exclusivamente al mapa maestro
  const mapaDiv = document.getElementById("mapaMaestroFullscreen");
  if (!mapaDiv) return;

  // Si ya existe la instancia, limpiamos capas viejas para redibujar de cero con datos frescos
  if (mapaGeneral) {
    try {
      mapaGeneral.eachLayer(layer => {
        // 🔥 VALIDACIÓN SEGURA NIVEL 3: Evita evaluar objetos undefined usando métodos nativos de Leaflet
        const esCapaRemovible = 
          (layer.argumentedGeoJSON || layer.feature) || // Detecta polígonos GeoJSON
          (layer instanceof L.Marker) ||                 // Detecta marcadores simples comunes
          (layer.options && layer.options.icon) ||       // Alternativa para detectar pines visuales
          (typeof L.MarkerCluster !== 'undefined' && layer instanceof L.MarkerCluster); // Solo evalúa cluster si existe

        // Si es una capa de datos (y no el mapa base de OpenStreetMap), la removemos
        if (esCapaRemovible && typeof layer.toGeoJSON !== 'undefined' || layer instanceof L.Marker) {
          mapaGeneral.removeLayer(layer);
        }
      });
    } catch(e) { 
      console.warn("Aviso al limpiar capas anteriores:", e); 
    }
  } else {
    // Si no existe, creamos la instancia enfocada en Posadas, Misiones
    try {
      mapaGeneral = L.map(mapaDiv.id, {
        zoomControl: true,
        attributionControl: false
      }).setView([-27.36708, -55.89608], 13);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(mapaGeneral);
    } catch (err) {
      console.error("❌ Fallo crítico al instanciar Leaflet:", err);
      return;
    }
  }

  try {
    // 1. INYECTAR POLÍGONOS DE TERRITORIOS
    if (typeof misTerritoriosGeoJSON !== 'undefined' && misTerritoriosGeoJSON !== null) {
      L.geoJSON(misTerritoriosGeoJSON, {
        style: function(feature) {
          const idTerritorio = parseInt(feature.properties?.name || feature.properties?.Territorio_N || 0);
          const paletaPastel = ["#473f57", "#394a51", "#3d4a3e", "#54483b", "#513939", "#4b3947", "#393b51"];
          const colorAsignado = paletaPastel[idTerritorio % paletaPastel.length];

          return {
            fillColor: colorAsignado,
            weight: 2,
            opacity: 0.8,
            color: "#52525b",
            fillOpacity: 0.25
          };
        },
        onEachFeature: function(feature, layer) {
          const nombreZona = feature.properties?.name || feature.properties?.Territorio_N || "S/D";
          
          layer.bindTooltip(String(nombreZona), {
            permanent: true,
            direction: 'center',
            className: 'texto-territorio-elegante'
          });

          layer.on('mouseover', function () { this.setStyle({ fillOpacity: 0.45 }); });
          layer.on('mouseout', function () { this.setStyle({ fillOpacity: 0.25 }); });
        }
      }).addTo(mapaGeneral);
      
      console.log("🗺️ Capa vectorial de polígonos inyectada en Mapa Maestro Fullscreen.");
    }

    // 2. INYECTAR MARCADORES (PINS) DE EDIFICIOS REGISTRADOS CON COORDENADAS
    const todosLosEdificios = window.baseDatosEdificiosMemoria || [];
    let pinsContados = 0;

    todosLosEdificios.forEach(e => {
      const lat = parseFloat(e.latitude);
      const lng = parseFloat(e.longitude);
      
      if (!isNaN(lat) && !isNaN(lng) && isFinite(lat) && lat !== 0) {
        pinsContados++;
        
        // Creamos un popup descriptivo estilizado para cuando toquen el pin
        const contenidoPopup = `
          <div style="color: #ffffff; background: #1f1f23; font-family: sans-serif; padding: 4px; border-radius: 4px;">
            <b style="font-size: 14px; color: #3b82f6; display:block; margin-bottom:2px;">🏢 ${e.address || 'Sin Dirección'}</b>
            ${e.name ? `<span style="font-size:12px; color:#a1a1aa; display:block; margin-bottom:4px;">${e.name}</span>` : ''}
            <div style="font-size: 11px; border-top: 1px solid #333; padding-top: 4px; margin-top: 4px; display:grid; gap:2px;">
              <div>🗺️ <b>Territorio:</b> ${e.territory || e.territorio || '-'}</div>
              <div>🔢 <b>Pisos:</b> ${e.floors || 0} | 🚪 <b>U:</b> ${e.unitsPerFloor || 0}</div>
              <div>📋 <b>Estado:</b> ${(e.status || e.estado || 'Pendiente').toUpperCase()}</div>
            </div>
          </div>
        `;

        L.marker([lat, lng])
          .bindPopup(contenidoPopup, { maxWidth: 220 })
          .addTo(mapaGeneral);
      }
    });

    console.log(`📍 Se renderizaron con éxito ${pinsContados} edificios en el Mapa Maestro.`);

    // Detector dinámico para optimizar las etiquetas de texto según profundidad de zoom
    mapaGeneral.on('zoomend', function() {
      const zoomActual = mapaGeneral.getZoom();
      const etiquetas = document.querySelectorAll('.texto-territorio-elegante');
      
      etiquetas.forEach(tag => {
        if (zoomActual >= 14) {
          tag.classList.add('vista-cerca');
          tag.classList.remove('zoom-alejado');
        } else {
          tag.classList.remove('vista-cerca');
          tag.classList.add('zoom-alejado');
        }
      });
    });

  } catch (err) {
    console.error("❌ Fallo crítico al poblar datos vectoriales en el mapa general:", err);
  }
}

// Variable global para controlar la pestaña activa de la bandeja (oficial / auditoria)
let modoListaAdmin = "oficial"; 

/** * 7.2 INTERCONEXIÓN DE FILTROS ADMINISTRATIVOS + MOTOR DE AUDITORÍA
 * Procesa en tiempo real las búsquedas por dirección o territorio cruzando los
 * datos contra la caché global para actualizar exclusivamente la grilla operativa. */
function ejecutarFiltrosAdmin() {
  const filtroDir = document.getElementById("busquedaDireccionAdmin")?.value.toLowerCase().trim() || "";
  const filtroTerr = document.getElementById("busquedaTerritorio")?.value.toLowerCase().trim() || "";

  // 1. Calculamos el badge rojo en tiempo real contando los pendientes en la base en memoria
  const totalPorAuditar = window.baseDatosEdificiosMemoria.filter(e => e.auditado === false || e.status === "pendiente_auditoria").length;
  const badge = document.getElementById("badgeAuditoriaContador");
  if (badge) {
    if (totalPorAuditar > 0) {
      badge.innerText = totalPorAuditar;
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }
  }

  // 2. Filtramos la base de datos basándonos en los inputs Y en la pestaña seleccionada
  window.todosLosEdificiosDB = window.baseDatosEdificiosMemoria.filter(e => {
    const cumpleDir = !filtroDir || (e.address && e.address.toLowerCase().includes(filtroDir));
    const cumpleTerr = !filtroTerr || (e.territory && String(e.territory).toLowerCase().includes(filtroTerr)) || (e.territorio && String(e.territorio).toLowerCase().includes(filtroTerr));
    
    // Separación lógica: si está en modo auditoría busca los no auditados; si no, los oficiales
    const esPendienteAuditoria = (e.auditado === false || e.status === "pendiente_auditoria");
    const cumpleModo = (modoListaAdmin === "auditoria") ? esPendienteAuditoria : !esPendienteAuditoria;

    return cumpleDir && cumpleTerr && cumpleModo;
  });

  // Reseteamos a la página 1 para evitar desbordamientos de índice y redibujamos
  paginaActual = 1;
  if (typeof cargarEdificios === "function") cargarEdificios();
}

/** * 6.1 RENDERIZADO DE LA GRILLA OPERATIVA DEL ADMINISTRADOR
 * Optimizado Nivel 3: Soporta pestañas dinámicas de Auditoría y libera restricciones de búsqueda. */
async function cargarEdificios() {
  const tablaCuerpo = document.getElementById("tablaEdificiosCuerpo");
  if (!tablaCuerpo) return;

  const TXT_DIR = document.getElementById("busquedaDireccionAdmin")?.value.trim() || "";
  const TXT_TERR = document.getElementById("busquedaTerritorio")?.value.trim() || "";

  // RESTRICCIÓN MODIFICADA: Solo forzamos el mensaje instructivo si estamos en modo "oficial".
  // En modo "auditoría" permitimos listar todo de entrada para revisar los ingresos nuevos.
  if (modoListaAdmin === "oficial" && TXT_DIR === "" && TXT_TERR === "") {
    tablaCuerpo.innerHTML = `
      <tr>
        <td style="text-align: center; color: #71717a; padding: 20px;">
          🔍 Introduzca un término en el buscador superior para desplegar resultados.
        </td>
      </tr>
    `;
    if (typeof actualizarControlesPaginacion === "function") actualizarControlesPaginacion(0);
    return;
  }

  tablaCuerpo.innerHTML = "";

  // Si no hay datos cargados en el puntero de filtrado, intentamos sincronizar
  if (!window.todosLosEdificiosDB || window.todosLosEdificiosDB.length === 0) {
    if (typeof preCargarBaseDatosEnMemoria === 'function') {
      await preCargarBaseDatosEnMemoria();
    }
  }

  const datosAIterar = window.todosLosEdificiosDB || [];
  
  if (datosAIterar.length === 0) {
    const mensajeVacio = (modoListaAdmin === "auditoria") 
      ? "🎉 ¡Felicidades! No hay nuevos edificios pendientes de auditoría."
      : "📭 No se encontraron edificios registrados.";
    
    tablaCuerpo.innerHTML = `<tr><td style="text-align:center; color:#a1a1aa; padding:20px;">${mensajeVacio}</td></tr>`;
    if (typeof actualizarControlesPaginacion === "function") actualizarControlesPaginacion(0);
    return;
  }

  // Cálculo de índices para la segmentación por página (Usa tus constantes nativas)
  const limiteElementos = typeof ELEMENTOS_POR_PAGINA !== 'undefined' ? ELEMENTOS_POR_PAGINA : 7;
  const indiceInicio = (paginaActual - 1) * limiteElementos;
  const indiceFin = indiceInicio + limiteElementos;
  const paginaSegmentada = datosAIterar.slice(indiceInicio, indiceFin);

  paginaSegmentada.forEach(e => {
    const fila = document.createElement("tr");
    const idEdificio = e.id || e._id;
    
    fila.style.cursor = "pointer";
    fila.style.transition = "background-color 0.2s ease";
    
    // Si es auditoría, interceptamos el click para mostrar los botones de aprobar/rechazar
    fila.setAttribute("onclick", `verDetalleEdificioAdmin('${idEdificio}')`);
    
    fila.onmouseover = () => fila.style.backgroundColor = "#27272a";
    fila.onmouseout = () => fila.style.backgroundColor = "transparent";
    
    fila.innerHTML = `
      <td style="font-weight: 600; color: #ffffff; padding: 14px 12px; border-bottom: 1px solid #27272a;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span>🏢 ${e.address || "Sin Dirección"}</span>
          ${modoListaAdmin === 'auditoria' ? '<span style="background:#ea580c; color:white; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:bold;">NUEVO</span>' : ''}
        </div>
        ${e.name ? `<small style="color:#a1a1aa; font-weight:normal; display:inline-block; margin-top:2px;">${e.name}</small>` : ''}
        <br><small style="color:#71717a; font-size:11px;">Territorio: ${e.territory || e.territorio || '-'}</small>
      </td>
    `;
    tablaCuerpo.appendChild(fila);
  });

  if (typeof actualizarControlesPaginacion === "function") {
    actualizarControlesPaginacion(datosAIterar.length);
  }
}

/** * 🔄 CONMUTADOR INTERNO DE PESTAÑAS (OFICIALES / POR AUDITAR)
 * Cambia el estado de visualización y refresca la grilla al instante. */
function cambiarModoListaAdmin(nuevoModo) {
  modoListaAdmin = nuevoModo;
  
  // Modificar clases visuales activas
  document.getElementById("btnListaOficial")?.classList.toggle("active", nuevoModo === "oficial");
  document.getElementById("btnListaAuditoria")?.classList.toggle("active", nuevoModo === "auditoria");
  
  const tituloTabla = document.getElementById("columnaTablaTitulo");
  if (tituloTabla) {
    tituloTabla.innerText = (nuevoModo === "auditoria") ? "Dirección (Ingresos Recientes)" : "Dirección";
  }

  // Cerrar el panel de detalles derecho para evitar confusiones
  const panelDetalle = document.getElementById("panelDetalleEdificio");
  if (panelDetalle) panelDetalle.style.display = "none";

  ejecutarFiltrosAdmin();
}

/** * ⚡ RESOLUTOR EJECUTIVO DE VERIFICACIÓN
 * Cambia el estado del edificio, impacta los datos y limpia la bandeja. */
function procesarVerificacionEdificio(idEdificio, aprobado) {
  const edificio = window.baseDatosEdificiosMemoria.find(e => (e.id || e._id) === idEdificio);
  if (!edificio) return;

  if (aprobado) {
    edificio.auditado = true;
    if (edificio.status === "pendiente_auditoria") edificio.status = "pendiente";
    alert(`🏢 Edificio "${edificio.address || 'seleccionado'}" aprobado con éxito.`);
  } else {
    // Si se rechaza, lo removemos de la memoria para limpiar la cola
    window.baseDatosEdificiosMemoria = window.baseDatosEdificiosMemoria.filter(e => (e.id || e._id) !== idEdificio);
    alert(`⚠️ Registro rechazado y removido de la cola de auditoría.`);
  }

  // Ocultar panel, guardar caché y actualizar pantallas
  document.getElementById("panelDetalleEdificio").style.display = "none";
  if (window.localStorage) {
    localStorage.setItem("edificios_cache_local", JSON.stringify(window.baseDatosEdificiosMemoria));
  }
  
  ejecutarFiltrosAdmin();
  if (typeof inicializarMapaGeneralAdministrador === "function") inicializarMapaGeneralAdministrador();
}
// =========================================================================
// 🔤 SECTOR: NORMALIZADOR ALFANUMÉRICO DE DIRECCIONES Y NOMENCLATURA VIAL
// =========================================================================

/** Normaliza cadenas de texto borrando acentos, caracteres extraños y abreviaturas comunes.
 * Optimiza las búsquedas e impide fallas de inyección HTML o quiebres por comillas.
 * @param {string} texto - Dirección en bruto tipeada por el encuestador
 * @returns {string} Texto plano limpio listo para comparación indexada */
function normalizarDireccion(texto) {
  if (!texto) return "";
  
  return texto
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bav\b|\bavenida\b/g, "av")
    .replace(/\bc\b|\bcalle\b/g, "")
    .replace(/\bpsje\b|\bpasaje\b/g, "psje")
    .replace(/['".,-]/g, " ")
    .replace(/\s+/g, " ");
}

/** * REPARACIÓN DEFINITIVA: CONTROLADOR DE PESTAÑAS DE BÚSQUEDA (Dirección / Territorio)
 * Sincroniza las clases 'active' y alterna la visibilidad de los contenedores compactos. */
function cambiarTabFiltro(tabTipo) {
  const btnDireccion = document.getElementById("btnTabDireccion");
  const btnTerritorio = document.getElementById("btnTabTerritorio");
  
  const contenedorDireccion = document.getElementById("buscarDireccionContainer");
  const contenedorTerritorio = document.getElementById("buscarTerritorioContainer");

  if (tabTipo === 'direccion') {
    btnDireccion?.classList.add('active');
    btnTerritorio?.classList.remove('active');
    if (contenedorDireccion) contenedorDireccion.style.display = "block";
    if (contenedorTerritorio) contenedorTerritorio.style.display = "none";
    console.log("🔍 Modo de búsqueda establecido en: Dirección");
  } else {
    btnTerritorio?.classList.add('active');
    btnDireccion?.classList.remove('active');
    if (contenedorDireccion) contenedorDireccion.style.display = "none";
    if (contenedorTerritorio) contenedorTerritorio.style.display = "block";
    console.log("🔍 Modo de búsqueda establecido en: Territorio");
  }
}
/** * 🌟 SISTEMA DE NOTIFICACIONES VISUALES (TOAST)
 * Reemplaza los alerts nativos por carteles flotantes elegantes y no bloqueantes.
 * @param {string} mensaje - El texto a mostrar.
 * @param {string} tipo - 'success', 'warning', 'error' (por defecto 'success') */
function mostrarAviso(mensaje, tipo = "success") {
  const container = document.getElementById("toast-container");
  if (!container) {
    // Salvavidas por si no agregaste el contenedor HTML todavía
    alert(mensaje);
    return;
  }

  // Configuración de colores según el tipo de aviso
  let bg = "#10b981"; // Verde success
  let icon = "✅";
  if (tipo === "warning") {
    bg = "#f59e0b"; // Amarillo/Naranja warning
    icon = "⚠️";
  } else if (tipo === "error") {
    bg = "#ef4444"; // Rojo error
    icon = "❌";
  }

  // Crear el elemento del aviso
  const toast = document.createElement("div");
  toast.style.background = bg;
  toast.style.color = "#ffffff";
  toast.style.padding = "12px 16px";
  toast.style.borderRadius = "8px";
  toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
  toast.style.fontSize = "14px";
  toast.style.fontWeight = "bold";
  toast.style.textAlign = "center";
  toast.style.opacity = "0";
  toast.style.transition = "all 0.4s ease";
  toast.style.pointerEvents = "auto";
  toast.style.display = "flex";
  toast.style.alignItems = "center";
  toast.style.justifyContent = "center";
  toast.style.gap = "8px";

  toast.innerHTML = `<span>${icon}</span> <span>${mensaje}</span>`;

  // Insertar en el contenedor
  container.appendChild(toast);

  // Efecto de entrada (Fade in + leve subida)
  setTimeout(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  }, 50);

  // Desvanecer y remover automáticamente a los 3.5 segundos
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 3500);
}

