// * Sistema de Gestión de Territorios y Visitas
 
// --- VARIABLES GLOBALES DEL NAVEGADOR ---
let paginaActual = 1;
let currentDept = null;
let currentUser = null;
let currentRole = null;
let currentBuildingId = null;
let prediMiniMap = null; 
let leafletMap = null;
let leafletMarker = null;
let miTemporizadorMapa = null; 
let miniMapaAdminInstance = null;
let mapaIncidenteAdminInstance = null;

let listaProblemasGlobal = [];

//--------------------------------------------------------------------------------------------//



// --- SISTEMA DE AUTENTICACIÓN (LOGIN / LOGOUT) ---
async function login() {
  const username = loginUser.value.trim();
  const password = loginPass.value.trim();
  loginMsg.innerText = "";

  if (!username || !password) {
    loginMsg.innerText = "Completá usuario y contraseña";
    return;
  }

  try {
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    
    const data = await res.json();
    
    if (!data.ok) {
      loginMsg.innerText = data.message || "Usuario o contraseña incorrectos";
      return;
    }

    currentUser = data.username;
    currentRole = data.role;
    localStorage.setItem("user", data.username);
    localStorage.setItem("role", data.role);
    
    iniciarApp();
  } catch (error) {
    console.error("Error en login:", error);
    loginMsg.innerText = "Error al conectar con el servidor";
  }
}

// --- FUNCIÓN CENTRAL DE PETICIONES HTTP (API FETCH NATIVA) ---
async function apiFetch(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    "x-user": currentUser,
    "x-role": currentRole
  };
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    logout();
    alert("Sesión expirada");
  }
  if (response.status === 403) {
    alert("No tenés permisos");
  }
  return response;
}

function tienePermiso(roles) {
  return roles.includes(currentRole);
}

function iniciarApp() {
  // 1. Ocultamos la pantalla de login de forma segura
  const elLogin = document.getElementById("loginScreen") || (typeof loginScreen !== 'undefined' ? loginScreen : null);
  if (elLogin) elLogin.style.display = "none";
  
  // 2. Evaluamos botones del panel control según el rol logueado
  aplicarPermisos();
  
  // 3. Redirección absoluta de pantallas contenedoras principales
  const appContainer = document.getElementById("appContainer");
  const mainDashboard = document.getElementById("mainDashboard");

  if (currentRole === "predi") {
    // 📱 INTERFAZ MÓVIL FORZADA: Apagamos el dashboard grande y sus vistas internas por completo
    if (mainDashboard) mainDashboard.style.display = "none";
    if (appContainer) appContainer.style.display = "block";
    
    // Desactivamos cualquier sub-vista de administrador activa por las dudas
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  } else {
    // 💻 PANEL DE CONTROL GENERAL (Admin / Conductor)
    if (mainDashboard) mainDashboard.style.display = "block";
    if (appContainer) appContainer.style.display = "none";
    
    // Abrimos directamente la vista del menú de tarjetas principales
    abrirVista("dashboardView");
  }
}

function abrirVista(id) {
  // 🚨 REGLA DE ORO DE SEGURIDAD: Si es predi y la vista NO es el editor, no lo dejamos tocar el dashboard admin
  if (currentRole === "predi" && id !== "editarView") {
    if (document.getElementById("mainDashboard")) document.getElementById("mainDashboard").style.display = "none";
    if (document.getElementById("appContainer")) document.getElementById("appContainer").style.display = "block";
    return; // Frenamos la ejecución acá
  }

  // Ocultar todas las sub-vistas internas
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  
  // Activar la sub-vista objetivo
  const vistaObjetivo = document.getElementById(id);
  if (vistaObjetivo) vistaObjetivo.classList.add("active");

  // --- SOLUCIÓN DE FLUJO DE CONTENEDORES PARA MÓVIL ---
  if (id === "editarView" && currentRole === "predi") {
    if (document.getElementById("appContainer")) document.getElementById("appContainer").style.display = "none";
    if (document.getElementById("mainDashboard")) document.getElementById("mainDashboard").style.display = "block";
  }

  // Acciones específicas según la vista
  if (id === "territorioView") {
    if (typeof cargarDashboard === "function") cargarDashboard();
    if (typeof cargarEdificios === "function") cargarEdificios(); 
    
    if (leafletMap) {
      setTimeout(() => { leafletMap.invalidateSize(); }, 100);
    } else if (typeof inicializarMapaLeaflet === "function") {
      inicializarMapaLeaflet(-27.36708, -55.89608);
    }
  }

  if (id === "problemasView" && typeof verProblemas === "function") {
    verProblemas();
  }
}

function aplicarPermisos() {
  // Buscamos la tarjeta de reportes de problemas en el menú principal
  const btnProblemas = document.querySelector('#dashboardView [onclick="abrirVista(\'problemasView\')"]');

  if (!btnProblemas) return;

  // Control estricto de herramientas según rol
  if (currentRole === "admin") {
    btnProblemas.style.display = "flex"; // El admin ve y gestiona los problemas abiertos
  } else if (currentRole === "conductor") {
    btnProblemas.style.display = "none"; // El conductor tiene un flujo limpio sin alertas
  }
}

function logout() {
  localStorage.removeItem("user");
  localStorage.removeItem("role");
  location.reload();
}

// Oidor de carga inicial de la página
window.addEventListener("load", async () => {
  const savedUser = localStorage.getItem("user");
  const savedRole = localStorage.getItem("role");
  
  if (savedUser && savedRole) {
    currentUser = savedUser;
    currentRole = savedRole;
    iniciarApp();
  }
  
  // Soporte para links directos por escaneo QR (?building=ID)
  const params = new URLSearchParams(window.location.search);
  const buildingIdParam = params.get("building");
  if (buildingIdParam && typeof cargarDepto === "function") {
    currentBuildingId = buildingIdParam;
    if (typeof mensajeInicial !== 'undefined' && mensajeInicial) mensajeInicial.style.display = "none";
    await cargarDepto();
  }
});

//--------------------------------------------------------gestion de usuarios ------------------------//


// =========================================================================
// 🔍 FUNCIÓN: BUSCAR EDIFICIO POR DIRECCIÓN O CÓDIGO (CON CONTROL DE BLOQUEO FIX)
// =========================================================================
async function buscar() {
  limpiarVista();
  const input = normalizarDireccion(buildingId.value);
  if (!input) return;
  
  mensajeInicial.style.display = "none";
  resultado.innerText = "Buscando...";

  try {
    const b = await apiFetch(`/building/${encodeURIComponent(input)}`);
    
    // --- MANEJO DEL 404 DEL SERVIDOR ---
    if (!b.ok) {
      if (b.status === 404) {
        resultado.innerText = "Edificio no encontrado";
        btnNuevoEdificio.style.display = "block";
        btnNuevoEdificio.onclick = function() { crearEdificio(); };
        return;
      }
      throw new Error(`Error en servidor: ${b.status}`);
    }

    const building = await b.json();
    if (!building || !building._id) {
      resultado.innerText = "Edificio no encontrado";
      btnNuevoEdificio.style.display = "block";
      btnNuevoEdificio.onclick = function() { crearEdificio(); };
      return;
    }

    // 🚀 1. INTERCEPCIÓN INMEDIATA SI ESTÁ BLOQUEADO POR SUPERADMIN
    if (building.isBlocked) {
      alert("🚫 Edificio temporalmente bloqueado por la administración.");
      
      // Limpiamos los textos de carga para que no quede el "Buscando..." colgado
      resultado.innerText = ""; 
      if (document.getElementById("departamentoVisitar")) {
        document.getElementById("departamentoVisitar").innerText = "--";
      }
      return; // ✋ Corta acá mismo: No guarda la ID ni ejecuta cargarDepto()
    }

    // 2. SI NO ESTÁ BLOQUEADO, CONTINÚA EL FLUJO NORMAL
    currentBuildingId = building._id;
    await cargarDepto();

  } catch (error) {
    console.error("Detalle del error en buscar:", error);
    resultado.innerText = "Edificio no encontrado o error de red";
    btnNuevoEdificio.style.display = "block";
    btnNuevoEdificio.onclick = function() { crearEdificio(); };
  }
}

// =========================================================================
// 🚪 FUNCIÓN: CARGAR PRÓXIMO DEPARTAMENTO DISPONIBLE
// =========================================================================
async function cargarDepto() {
  try {
    // 1. Limpieza de ID por si viene como objeto completo
    let idLimpia = typeof currentBuildingId === 'object' ? (currentBuildingId._id || currentBuildingId.id) : currentBuildingId;
    
    const res = await apiFetch(`/next/${idLimpia}`);
    const data = await res.json();
    
    if (typeof listaTerritorio !== 'undefined' && listaTerritorio) listaTerritorio.innerHTML = "";

    // 🏁 CASO A: Edificio Completado (Regla de los 4 meses o fin de circuito)
    if (data.message === "NO_AVAILABLE" || !data.dept) {
      resultado.innerHTML = `
        <div style="font-size:30px; margin-bottom:5px;">🏁</div>
        <div style="font-size:14px; font-weight:bold; color:white;">¡Completado!</div>
        <div style="font-size:11px; color:#9e9e9e; max-width:180px; margin:0 auto; line-height:1.3;">
          No quedan departamentos disponibles por visitar en este momento.
        </div>
      `;
      
      // Ocultamos de forma segura los elementos que no se van a usar
      if (typeof nota !== 'undefined' && nota) {
        nota.value = ""; // Vaciamos la nota si ya se terminó el edificio
        nota.style.display = "none";
      }
      if (typeof btnOk !== 'undefined' && btnOk) btnOk.style.display = "none";
      if (typeof btnNo !== 'undefined' && btnNo) btnNo.style.display = "none";
      if (typeof reportBtn !== 'undefined' && reportBtn) reportBtn.style.display = "none";
      if (typeof btnSiguiente !== 'undefined' && btnSiguiente) btnSiguiente.style.display = "none";
      
      await mostrarInfoEdificio();
      
      setTimeout(() => {
        if (typeof cancelarEdificioMovil === "function") {
          cancelarEdificioMovil();
        }
      }, 3500);
      
      return;
    }

    // 🎉 CASO B: Hay departamento aleatorio disponible
    currentDept = data.dept;

    // ✨ ASEGURAMOS LIMPIEZA: Al recibir un depto nuevo de verdad, la nota vieja se va
    if (typeof nota !== 'undefined' && nota) {
      nota.value = ""; 
      nota.style.display = "block";
    }

    if (typeof btnSiguiente !== 'undefined' && btnSiguiente) btnSiguiente.style.display = "block";

    resultado.innerText = data.dept.number;
    
    if (typeof btnSiguiente !== 'undefined' && btnSiguiente) btnSiguiente.style.visibility = "hidden";

    if (typeof btnOk !== 'undefined' && btnOk) { btnOk.style.display = "block"; btnOk.disabled = false; }
    if (typeof btnNo !== 'undefined' && btnNo) { btnNo.style.display = "block"; btnNo.disabled = false; }
    if (typeof reportBtn !== 'undefined' && reportBtn) reportBtn.style.display = "none";

    await mostrarInfoEdificio();

  } catch (error) {
    console.error("Error al cargar el siguiente departamento:", error);
    alert("Error de comunicación al traer el próximo departamento.");
  }
}

// =========================================================================
// ✔/✕ FUNCIÓN: MARCAR ESTADO DE LA VISITA (ATENDIÓ o NO EN CASA)
// =========================================================================
async function marcar(status) {
  if (!currentDept) return;
  btnOk.disabled = true;
  btnNo.disabled = true;

  // Armamos el paquete leyendo el cuadro de texto ANTES de hacer cualquier otra acción
  const datosVisita = {
    departmentId: currentDept._id,
    buildingId: currentDept.buildingId || currentBuildingId,
    status: status,
    note: nota.value.trim()
  };
  
  // 🛰️ CASO INTERNET OFFLINE: Guardado en la memoria interna del celu
  if (!navigator.onLine) {
    guardarEnMochilaLocal("visitas_pendientes", datosVisita);
    alert("⏳ Visita guardada localmente (Sin Señal). Se enviará sola apenas recuperes internet.");
    
    // 🌟 QUITAMOS 'nota.value = ""' de acá: Esperamos a que toquen "Siguiente" para borrarla visualmente
    if (typeof btnSiguiente !== 'undefined' && btnSiguiente) btnSiguiente.style.visibility = "visible";
    return;
  }
  
  // CASO INTERNET ONLINE: Envíos normales al servidor de Render
  try {
    const res = await apiFetch("/visit", {
      method: "POST",
      body: JSON.stringify(datosVisita)
    });
    
    if (!res.ok) throw new Error(`Servidor respondió con código: ${res.status}`);
    
    // 🌟 QUITAMOS 'nota.value = ""' de acá también: Mantenemos el texto en pantalla hasta cambiar de depto
    if (typeof btnSiguiente !== 'undefined' && btnSiguiente) btnSiguiente.style.visibility = "visible";

  } catch (error) {
    console.error("Falla de red al marcar visita, respaldando...", error);
    guardarEnMochilaLocal("visitas_pendientes", datosVisita);
    alert("⏳ Hubo un problema de red. La visita quedó guardada en el celu para no perderse.");
    
    if (typeof btnSiguiente !== 'undefined' && btnSiguiente) btnSiguiente.style.visibility = "visible";
  }
}

// =========================================================================
// ➡️ FUNCIÓN: PASAR AL SIGUIENTE DEPARTAMENTO DE FORMA BLINDADA
// =========================================================================
async function siguiente() {
  console.log("➡️ Botón Siguiente presionado. Buscando próximo departamento aleatorio...");
  
  // Acá sí limpiamos la pantalla por completo porque el usuario explícitamente decidió avanzar
  if (typeof nota !== 'undefined' && nota) nota.value = "";
  
  if (typeof btnSiguiente !== 'undefined' && btnSiguiente) btnSiguiente.style.visibility = "hidden";

  if (typeof btnOk !== 'undefined' && btnOk) btnOk.disabled = false;
  if (typeof btnNo !== 'undefined' && btnNo) btnNo.disabled = false;

  if (typeof cargarDepto === "function") {
    await cargarDepto();
  } else {
    console.error("Error crítico: La función cargarDepto() no está definida en app.js");
    alert("No se pudo cargar el siguiente departamento. Intenta recargar el edificio.");
  }
}

async function mostrarInfoEdificio() {
  try {
    const res = await apiFetch(`/building-info/${currentBuildingId}`);
    const data = await res.json();
    const b = data.building;

    // ✨ Cálculo de Edificio Nuevo (Lapso de 30 días)
    let cartelNuevoHtml = "";
    if (b.createdAt || b.fechaCreacion) { 
      const fechaCreacion = new Date(b.createdAt || b.fechaCreacion);
      const hoy = new Date();
      const diferenciaDias = Math.floor((hoy - fechaCreacion) / (1000 * 60 * 60 * 24));
      
      if (diferenciaDias <= 30) {
        const fechaFormateada = fechaCreacion.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        // Ahora se diseña de manera más sutil para el footer izquierdo
        cartelNuevoHtml = `Edificio creado el ${fechaFormateada}`;
      }
    }

    if (typeof reportBtn !== 'undefined' && reportBtn) {
      reportBtn.style.display = "none"; 
    }

    // Activamos el contenedor principal
    infoEdificio.style.display = "block";
    
    // Formateamos la fecha de la última visita
    const fechaUltimaVisita = data.lastVisit ? new Date(data.lastVisit.date).toLocaleDateString('es-AR') : "Nunca";
    
    infoEdificio.innerHTML = `
      <div class="sectionCard" style="background: #121214; border: 1px solid #27272a; padding: 16px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.4);">
        
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

          <div style="display: flex; flex-direction: column; gap: 6px; align-items: center; flex-shrink: 0;">
            <div id="miniMapaPredi" style="width: 115px; height: 95px; border-radius: 10px; border: 1px solid #4b5563; background:#1f1f22; pointer-events: none;"></div>
            
            <div style="background: #27272a; border: 1px solid #3f3f46; border-radius: 6px; padding: 4px 6px; display: flex; align-items: center; gap: 4px; font-size: 11px; color: #e4e4e7; width: 115px; justify-content: center; box-sizing: border-box;">
              <span>🗓️</span> <span>${fechaUltimaVisita}</span>
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

        ${data.issue ? `
          <div style="background:#7f1d1d; color:#fef2f2; border:1px solid #dc2626; padding:10px; border-radius:10px; margin-top:12px; font-size:13px; font-weight:600; line-height:1.4;">
            ⚠ <b>Alerta (${data.issue.type}):</b> ${data.issue.description || "Sin detalles"}
          </div>
        ` : ""}
      </div>
    `;

    // --- RENDERIZACIÓN DEL MAPA ---
    const miniMapaDiv = document.getElementById("miniMapaPredi");
    if (miniMapaDiv) {
      if (prediMiniMap) {
        prediMiniMap.remove();
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
        prediMiniMap.setView([-27.36708, -55.89608], 14);
      }

      setTimeout(() => { if (prediMiniMap) prediMiniMap.invalidateSize(); }, 220);
    }
  } catch (error) {
    console.error("Error en mostrarInfoEdificio:", error);
  }
}
//---------------------------------------------------------------------------------------------//

// ==========================================
// ⚠️ --- MÓDULO REPORTES DE PROBLEMAS ---
// ==========================================

function abrirReporte() { 
  if(typeof modalReporte !== 'undefined') {
    modalReporte.style.display = "flex"; 
  } else {
    const modal = document.getElementById("modalReporte");
    if(modal) modal.style.display = "flex";
  }
}

function cerrarReporte() { 
  if(typeof modalReporte !== 'undefined') {
    modalReporte.style.display = "none"; 
  } else {
    const modal = document.getElementById("modalReporte");
    if(modal) modal.style.display = "none";
  }
}

// 📱 Predicador: Envía el reporte capturando correctamente los nuevos campos (Blindada Sin Internet)
async function enviarReporte() {
  // Capturamos la descripción
  const descripcion = descProblema.value.trim();
  
  // Capturamos el nuevo campo de Nombre que agregamos en el index.html
  const inputNombre = document.getElementById("edit_nombre_reporta");
  const nombreReporta = inputNombre ? inputNombre.value.trim() : "";
  
  // Capturamos el tipo del selector select
  const selectorTipo = document.getElementById("tipoProblema");
  const tipo = selectorTipo ? selectorTipo.value : "Otro";

  // 1. Validaciones obligatorias en el Frontend antes de gastar datos/red
  if (!nombreReporta) {
    alert("Por favor, introduce tu nombre para saber quién reporta el problema.");
    return;
  }
  if (!descripcion) {
    alert("Por favor, escribe los detalles del problema antes de enviar.");
    return;
  }

  // Extraemos de forma segura la ID limpia
  let idEdificioLimpia = currentBuildingId;
  if (currentBuildingId && typeof currentBuildingId === 'object') {
    idEdificioLimpia = currentBuildingId._id || currentBuildingId.id;
  }

  // VALIDACIÓN EXTRA: Si no hay ID válida, no permitimos el envío
  if (!idEdificioLimpia || idEdificioLimpia === "[object Object]") {
    alert("Error local: No se pudo identificar el edificio actual. Intenta recargar la página del edificio.");
    return;
  }

  // Armamos el paquete de datos del reporte idéntico a tu esquema original
  const datosReporte = {
    buildingId: idEdificioLimpia, 
    departmentId: currentDept?._id || null,
    departmentNumber: currentDept?.number || null, 
    type: tipo,
    description: descripcion,
    reportedBy: nombreReporta, 
    status: "PENDIENTE" 
  };

  // Imprimimos en consola para auditar qué estamos procesando
  console.log("🚀 Procesando reporte con ID de edificio:", idEdificioLimpia);

  // 🛰️ CASO 1: Si el celular detecta de antemano que está sin conexión a internet
  if (!navigator.onLine) {
    guardarEnMochilaLocal("reportes_pendientes", datosReporte);
    
    // Dejamos fluir la interfaz para comodidad del usuario
    cerrarReporte();
    descProblema.value = "";
    if (inputNombre) inputNombre.value = ""; 
    
    alert("⚠️ Guardado localmente (Sin Internet). El reporte de problemas se enviará solo cuando recuperes señal.");
    return;
  }

  // CASO 2: Intentamos enviar normalmente por red
  try {
    const res = await apiFetch("/issues", {
      method: "POST",
      body: JSON.stringify(datosReporte)
    });

    if (res.ok) {
      cerrarReporte();
      descProblema.value = "";
      if (inputNombre) inputNombre.value = ""; 
      alert("Reporte enviado con éxito al panel de control.");
      await mostrarInfoEdificio();
    } else {
      const errorData = await res.json().catch(() => ({}));
      alert("No se pudo enviar el reporte: " + (errorData.error || "Error en el servidor"));
    }
  } catch (error) {
    console.error("Error crítico al enviar reporte, respaldando...", error);
    
    // Si da un error de red imprevisto en plena carga, lo guardamos en el celular para salvarlo
    guardarEnMochilaLocal("reportes_pendientes", datosReporte);
    
    cerrarReporte();
    descProblema.value = "";
    if (inputNombre) inputNombre.value = ""; 

    alert("⏳ Problema temporal de red. El reporte quedó guardado de forma segura en tu celu y se reenviará automáticamente.");
  }
}
// 💻 Admin (NUEVA): Carga la info total del edificio cruzada con el incidente + Mini Mapa + Historial

async function verDetalleIncidenteAdmin(incidente, index) {
  const panel = document.getElementById("panelDetalleProblemaAdmin");
  panel.innerHTML = `<p style="text-align:center; color:gray; padding-top:50px;">Consultando detalles de infraestructura del edificio...</p>`;

  try {
    // 🚨 EXTRACCIÓN SEGURA DEL ID (Evita el error [object Object] en la URL de la API)
    let idEdificioLimpio = "";
    if (incidente.buildingId && typeof incidente.buildingId === "object") {
      idEdificioLimpio = incidente.buildingId._id || incidente.buildingId.id || "";
    } else {
      idEdificioLimpio = incidente.buildingId || "";
    }

    if (!idEdificioLimpio || idEdificioLimpio === "[object Object]") {
      throw new Error("El incidente no cuenta con un ID de edificio válido asociado.");
    }

    // Cruza los datos llamando a la info completa del edificio asignado usando el ID en formato String
    const res = await apiFetch(`/building-info/${idEdificioLimpio}`);
    if (!res.ok) {
      throw new Error(`El servidor respondió con un estado ${res.status}`);
    }
    
    const data = await res.json();
    const b = data.building;

    if (!b) {
      throw new Error("No se encontraron datos de infraestructura para el edificio consultado.");
    }

    // Formateamos la fecha exacta si existe en el objeto i de MongoDB
    let fechaFormateada = "No informada";
    if (incidente.createdAt) {
      fechaFormateada = new Date(incidente.createdAt).toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }) + " hs";
    }

    // Estructura limpia y potente con historial compacto e información similar a la sección Admin
    panel.innerHTML = `
      <div style="background:#27272a; border:1px solid #ef4444; padding:14px; border-radius:12px; margin-bottom:15px;">
        <span style="font-size:11px; color:#ef4444; font-weight:700; text-transform:uppercase; display:block; margin-bottom:4px;">Detalles de la Alerta</span>
        <h3 style="margin:0; color:white; font-size:18px;">⚠️ ${incidente.type}</h3>
        <p style="margin:8px 0; color:#e4e4e7; font-size:14px; background:#18181b; padding:10px; border-radius:8px; border:1px solid #27272a; line-height:1.4;">
          "${incidente.description || "Sin descripción detallada."}"
        </p>
        <div style="display:flex; flex-direction:column; gap:4px; font-size:12px; color:#a1a1aa; margin-top:4px;">
          <span>👤 Reportado por: <b style="color:white;">${incidente.reportedBy || "Anónimo"}</b></span>
          ${incidente.departmentNumber ? `<span>🚪 Departamento involucrado: <b style="color:white;">${incidente.departmentNumber}</b></span>` : ""}
          <span style="color:#71717a; margin-top:2px;">🕒 Fecha del reporte: ${fechaFormateada}</span>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
        <div>
          <h4 style="margin:0; color:white; font-size:18px;">${b.address || "Dirección no disponible"}</h4>
          <p style="color:gray; margin:2px 0; font-size:12px;">${b.address2 || "Sin especificaciones de zona"}</p>
        </div>
        <button class="secondary" style="width:auto; min-height:34px; padding:4px 10px; font-size:12px; border-radius:8px; margin:0;" onclick='abrirEditorEdificioDirecto(${JSON.stringify(b)})'>✏️ Editar Edificio</button>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; font-size:12px; background:#252525; padding:10px; border-radius:10px; margin-bottom:15px; border: 1px solid #333;">
        <div>🏢 <b>Nombre:</b> ${b.name || "-"}</div>
        <div>🗺️ <b>Territorio:</b> ${b.territory || "-"}</div>
        <div>🔢 <b>Pisos:</b> ${b.floors || 0}</div>
        <div>🚪 <b>Deptos/Piso:</b> ${b.unitsPerFloor || 0}</div>
        <div>🌱 <b>PB:</b> ${b.hasGroundFloor ? "Sí" : "No"}</div>
        <div>🛎️ <b>Portero:</b> ${b.hasDoorman ? "Sí" : "No"}</div>
      </div>

      <div id="miniMapaIncidenteAdmin" style="width:100%; height:150px; border-radius:10px; margin-bottom:15px; border:1px solid #3f3f46;"></div>

      <h5 style="margin:12px 0 6px; color:#3b82f6; font-size:13px; text-transform:uppercase;">🕒 Historial de Infraestructura y Visitas</h5>
      <div style="font-size:12px; background:#111; padding:10px; border-radius:8px; margin-bottom:20px; border:1px solid #222; max-height:110px; overflow-y:auto;">
        <div style="padding-bottom:6px; border-bottom:1px solid #222; color:#bdbdbd;">
          📅 <b>Última Visita General:</b> ${data.lastVisit ? new Date(data.lastVisit.date).toLocaleDateString('es-AR') : "No se registran visitas previas"}
        </div>
        <div style="margin-top:6px; color:gray; line-height:1.3;">
          📋 <b>Notas históricas:</b> ${b.description || "El edificio no posee anotaciones de administración todavía."}
        </div>
      </div>

      <h5 style="margin:0 0 8px; color:white; font-size:13px;">⚙️ Resolver o Cambiar Estado del Incidente</h5>
      <div style="display:flex; gap:10px;">
        <button onclick="cambiarEstadoIncidente('${incidente._id || incidente.id}', 'EN_PROCESO')" style="background:#eab308; color:black; font-weight:700; border:none; padding:10px; border-radius:10px; flex:1; font-size:13px; cursor:pointer; transition: opacity 0.2s;">
          ⏳ En Proceso
        </button>
        <button onclick="resolverIncidenteCompleto('${incidente._id || incidente.id}')" style="background:#22c55e; color:white; font-weight:700; border:none; padding:10px; border-radius:10px; flex:1; font-size:13px; cursor:pointer; transition: opacity 0.2s;">
          ✅ Solucionado
        </button>
      </div>
    `;

    // --- RENDER DE MAPA SEGURO EN PANEL DE INCIDENTES (Evita huecos grises) ---
    setTimeout(() => {
      try {
        if (typeof mapaIncidenteAdminInstance !== 'undefined' && mapaIncidenteAdminInstance !== null) {
          mapaIncidenteAdminInstance.remove();
          mapaIncidenteAdminInstance = null;
        }

        const latValida = parseFloat(b.latitude);
        const lngValida = parseFloat(b.longitude);
        const tieneCoordenadas = !isNaN(latValida) && !isNaN(lngValida) && isFinite(latValida) && latValida !== 0;

        mapaIncidenteAdminInstance = L.map('miniMapaIncidenteAdmin', {
          zoomControl: false, attributionControl: false, dragging: false, 
          touchZoom: false, doubleClickZoom: false, scrollWheelZoom: false
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaIncidenteAdminInstance);

        let mapaCentrado = false;
        if (tieneCoordenadas) {
          L.marker([latValida, lngValida]).addTo(mapaIncidenteAdminInstance);
          mapaIncidenteAdminInstance.setView([latValida, lngValida], 16);
          mapaCentrado = true;
        }

        // Si no tiene coordenadas cargadas, se posiciona usando el polígono de su territorio
        if (!mapaCentrado && b.territory && typeof misTerritoriosGeoJSON !== 'undefined' && misTerritoriosGeoJSON) {
          let capaGeoJSON = L.geoJSON(misTerritoriosGeoJSON, {
            filter: (f) => String(f.properties.name || f.properties.Territorio_N) === String(b.territory),
            style: { color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.1 }
          }).addTo(mapaIncidenteAdminInstance);

          if (capaGeoJSON.getLayers().length > 0) {
            mapaIncidenteAdminInstance.fitBounds(capaGeoJSON.getBounds(), { padding: [5, 5] });
            mapaCentrado = true;
          }
        }

        // Posicionamiento de respaldo por si todo falla
        if (!mapaCentrado) {
          mapaIncidenteAdminInstance.setView([-27.36708, -55.89608], 14);
        }

        mapaIncidenteAdminInstance.invalidateSize();
      } catch (mapErr) {
        console.error("Error cargando mapa de incidentes:", mapErr);
      }
    }, 120);

  } catch (err) {
    console.error("Error al desplegar detalle del incidente:", err);
    panel.innerHTML = `<p style="color:#ef4444; padding:20px; text-align:center;">⚠️ Error al sincronizar: ${err.message}</p>`;
  }
}
// Función corregida para abrir el historial usando la ruta existente del servidor
async function abrirHistorialEdificio() {
    const idEdificio = currentBuildingId; 
    const contenedorHistorial = document.getElementById("historialContenido");
    const modal = document.getElementById("modalHistorial");
    
    if (!idEdificio) {
        alert("Primero selecciona un edificio de la lista.");
        return;
    }

    modal.style.display = "flex";
    contenedorHistorial.innerHTML = `<p style="color:#71717a; text-align:center; padding:20px; font-size:13px;">Buscando registros...</p>`;

    try {
        // Usa la ruta que SI existe y que no da error 404
        const res = await apiFetch(`/building-info/${idEdificio}`);
        if (!res.ok) throw new Error("No se pudo obtener el historial");
        
        const resData = await res.json();
        
        // Mapeamos de dónde vienen las visitas en tu estructura de datos compartida
        // Probamos con todas las variantes posibles que devuelve tu backend
        const visitas = resData.history || resData.visits || resData.visitas || (resData.lastVisit ? [resData.lastVisit] : []); 

        if (visitas.length === 0) {
            contenedorHistorial.innerHTML = `
                <div style="text-align:center; padding:30px; color:#71717a;">
                    <p style="font-size:24px; margin-bottom:5px;">📂</p>
                    <p style="font-size:13px; margin:0;">Este edificio todavía no tiene visitas registradas.</p>
                </div>`;
            return;
        }

        // Ordenamos las visitas por fecha (más nuevas primero)
        visitas.sort((a, b) => new Date(b.date || b.fecha || b.createdAt) - new Date(a.date || a.fecha || a.createdAt));

        contenedorHistorial.innerHTML = "";

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
                badgeText = "✖ NO EN CASA";
            }

            const tarjetaVisita = `
                <div style="background: #2c2c2e; border: 1px solid #3a3a3c; border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;">
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
            contenedorHistorial.insertAdjacentHTML("beforeend", tarjetaVisita);
        });

    } catch (error) {
        console.error("Error cargando historial:", error);
        contenedorHistorial.innerHTML = `<p style="color:#ef4444; text-align:center; padding:20px; font-size:13px;">Error al conectar con el servidor para traer el historial.</p>`;
    }
}

function cerrarHistorial() {
    document.getElementById("modalHistorial").style.display = "none";
}


// 💻 Admin: Lista los problemas en un Layout Premium de dos columnas (Dashboard)

async function verProblemas() {
  const probView = document.getElementById("problemasView");
  if (!probView) return;

  // Re-estructuramos la vista para crear las dos columnas dinámicas
  probView.innerHTML = `
    <div style="padding: 20px; max-width: 1400px; margin: 0 auto;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <div>
          <button class="secondary backModern" style="margin:0;" onclick="abrirVista('dashboardView')">← Volver</button>
          <h2 style="margin:10px 0 0 0; font-size:28px; color:white;">⚠️ Gestión de Incidentes y Reportes</h2>
        </div>
        <div style="background:#27272a; border:1px solid #3f3f46; padding:10px 16px; border-radius:12px; text-align:right;">
          <span style="font-size:12px; color:#a1a1aa; display:block;">Reportes Activos</span>
          <b id="contadorProblemasAdmin" style="font-size:20px; color:#ef4444;">-</b>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 20px; min-height: 70vh;" class="admin-grid-layout">
        <div style="background:#18181b; border:1px solid #27272a; border-radius:16px; padding:15px; display:flex; flex-direction:column; gap:10px; max-height:75vh; overflow-y:auto;" id="listaReportesAdminContenedor">
          <p style='padding:15px; color:gray; text-align:center;'>Cargando reportes en tiempo real...</p>
        </div>

        <div style="background:#18181b; border:1px solid #27272a; border-radius:16px; padding:20px; position:sticky; top:20px; max-height:75vh; overflow-y:auto;" id="panelDetalleProblemaAdmin">
          <div style="text-align:center; color:#71717a; margin-top:100px;">
            <span style="font-size:48px; display:block; margin-bottom:10px;">🔍</span>
            Selecciona un reporte de la lista para auditar el edificio, ver historiales y aplicar resoluciones.
          </div>
        </div>
      </div>
    </div>
  `;

  try {
    const res = await apiFetch("/issues");
    listaProblemasGlobal = await res.json();
    
    const contenedorLista = document.getElementById("listaReportesAdminContenedor");
    const contador = document.getElementById("contadorProblemasAdmin");
    
    contador.innerText = listaProblemasGlobal.length;

    if (!listaProblemasGlobal.length) {
      contenedorLista.innerHTML = "<p style='padding:30px; color:#a1a1aa; text-align:center; font-size:14px;'>🎉 ¡Excelente! No hay problemas pendientes en ningún edificio.</p>";
      return;
    }

    contenedorLista.innerHTML = "";
    listaProblemasGlobal.forEach((i, index) => {
      // Color decorativo del borde/fuente según el tipo de incidente
      let colorTipo = "#ef4444"; 
      if (i.type?.toLowerCase().includes("dato")) colorTipo = "#eab308";
      if (i.type?.toLowerCase().includes("portero")) colorTipo = "#3b82f6";

      // Badge visual de estado adaptado a tus enums en Mayúsculas
      let estadoBadge = `<span style="background:#3f1f1f; color:#f87171; border:1px solid #ef4444; padding:2px 6px; border-radius:6px; font-size:10px; font-weight:600;">PENDIENTE</span>`;
      if (i.status === "EN_PROCESO") {
        estadoBadge = `<span style="background:#3b2e16; color:#fde047; border:1px solid #eab308; padding:2px 6px; border-radius:6px; font-size:10px; font-weight:600;">EN PROCESO</span>`;
      }

      // EVITAMOS EL [object Object]: Si buildingId es un objeto, mostramos la dirección.
      let textoEdificio = "No asignado";
      if (i.buildingId) {
        if (typeof i.buildingId === "object" && i.buildingId.address) {
          textoEdificio = i.buildingId.address;
        } else if (typeof i.buildingId === "string" && i.buildingId !== "[object Object]") {
          textoEdificio = "ID: " + i.buildingId;
        } else {
          textoEdificio = "Edificio no reconocido (Reporte Corrupto)";
        }
      }

      const card = document.createElement("div");
      card.className = "edificio-item-lista";
      card.style.cssText = "background:#27272a; border:1px solid #3f3f46; padding:14px; border-radius:12px; cursor:pointer; transition:all 0.2s;";
      card.onclick = () => verDetalleIncidenteAdmin(i, index);
      
      // 🚨 AGREGAMOS event.stopPropagation() al botón de borrar para que no interfiera al hacer clic
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; width:100%;">
          <div style="flex-grow:1;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <b style="color:${colorTipo}; font-size:14px;">⚠️ ${i.type || "Incidente"}</b>
              ${estadoBadge}
            </div>
            <span style="color:white; font-weight:600; font-size:12px; display:block; margin-top:2px;">📍 ${textoEdificio}</span>
            <p style="margin:6px 0 0 0; color:#d4d4d8; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${i.description || "Sin descripción"}
            </p>
            
            <button onclick="event.stopPropagation(); eliminarReporteRotoDirecto(event, '${i._id || i.id}')" style="background:#451a1a; color:#f87171; border:1px solid #ef4444; padding:4px 10px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer; margin-top:10px; transition: background 0.2s;">
              🗑️ Eliminar Reporte
            </button>
          </div>
          <span style="color:#71717a; font-weight:bold; align-self:center; font-size:16px;">→</span>
        </div>
      `;
      contenedorLista.appendChild(card);
    });

  } catch (error) {
    console.error("Error al listar reportes en el panel de administración:", error);
    document.getElementById("listaReportesAdminContenedor").innerHTML = "<p style='color:#ef4444; padding:15px;'>Error al conectar con los servidores de reportes.</p>";
  }
}
// 🛑 NUEVA FUNCIÓN AUXILIAR: Va al final de tu app.js o abajo de verProblemas
async function eliminarReporteRotoDirecto(event, id) {
  // Evitamos que al hacer click en el botón se intente seleccionar la tarjeta y rompa la derecha
  event.stopPropagation();

  if (!confirm("¿Querés eliminar este reporte viejo de forma permanente de la base de datos?")) return;

  try {
    const res = await apiFetch(`/issues/${id}`, {
      method: "DELETE"
    });

    if (res.ok) {
      alert("Reporte eliminado correctamente.");
      await verProblemas(); // Refrescamos el panel al instante
    } else {
      alert("No se pudo eliminar el reporte del servidor.");
    }
  } catch (error) {
    console.error("Error en eliminarReporteRotoDirecto:", error);
    alert("Error de red al intentar borrar.");
  }
}





// 💻 Admin (NUEVA): Cambia el estado a EN_PROCESO en el servidor
async function cambiarEstadoIncidente(id, nuevoEstado) {
  try {
    const res = await apiFetch(`/issues/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status: nuevoEstado })
    });

    if (res.ok) {
      alert(`El reporte ahora figura como: "${nuevoEstado.replace('_', ' ')}"`);
      await verProblemas(); // Refrescamos el Dashboard al instante
    } else {
      alert("El servidor no pudo actualizar el estado del problema.");
    }
  } catch (error) {
    console.error("Error en cambiarEstadoIncidente:", error);
    alert("Error de comunicación al actualizar estado.");
  }
}

// 💻 Admin (NUEVA): Elimina o marca como RESUELTO el problema
async function resolverIncidenteCompleto(id) {
  if (!confirm("¿Confirmas que el problema ha sido solucionado por completo? Se removerá la alerta activa del edificio.")) return;

  try {
    const res = await apiFetch(`/issues/${id}`, {
      method: "DELETE"
    });

    if (res.ok) {
      alert("¡Incidente solucionado con éxito!");
      await verProblemas(); // Recarga la lista y limpia la pantalla
    } else {
      // Intento alternativo por si tu backend está configurado con actualización PUT a RESUELTO
      const intentoPut = await apiFetch(`/issues/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status: "RESUELTO" })
      });
      
      if (intentoPut.ok) {
        alert("¡Incidente marcado como RESUELTO!");
        await verProblemas();
      } else {
        alert("No se pudo procesar la baja del incidente en el servidor.");
      }
    }
  } catch (error) {
    console.error("Error en resolverIncidenteCompleto:", error);
    alert("Error de conexión al procesar la resolución.");
  }
}

// 🔧 Función puente para abrir el modal de edición de edificio existente
function abrirEditorEdificioDirecto(edificioObj) {
  if (typeof abrirEditorEdificio === 'function') {
    abrirEditorEdificio(edificioObj);
  } else if (typeof editarEdificioAdmin === 'function') {
    editarEdificioAdmin(edificioObj);
  } else {
    alert("Función de edición no encontrada. Asegúrate de tener tu modal o función de edición cargada.");
  }
}

//-------------------------------------CIERRE SECTOR REPORTES DE PROBLEMAS -------------------------------//


// Nueva función centralizada para auditar un edificio (Detalles, Alertas, Historial y Editar)
async function verDetalleEdificioAdmin(buildingId) {
  // 🌟 GUARDAMOS EL ID EN TU VARIABLE ACTUAL PARA QUE LA APP SEPA QUÉ EDIFICIO ESTÁ EN PANTALLA
  currentBuildingId = buildingId; 

  const panel = document.getElementById("panelDetalleEdificio");
  panel.style.display = "block";
  panel.innerHTML = `<p style="text-align:center; color:gray;">Cargando historial y detalles...</p>`;

  try {
    const res = await apiFetch(`/building-info/${buildingId}`);
    const data = await res.json();
    const b = data.building;
    const addrEscaped = b.address.replace(/'/g, "\\'");

    // ✨ CALCULO DE EDIFICIO NUEVO EN PANEL ADMIN
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
        <div style="background:#3a1f1f; border: 1px solid #f44336; color:#ff8a80; padding:12px; border-radius:12px; margin-bottom:15px; font-size:15px;">
          ⚠️ <b>Problema Reportado (${data.issue.type}):</b> ${data.issue.description || "Sin descripción adicional"}
        </div>
      `;
    }

    // Renderizamos la estructura base aplicando el diseño Flex (Datos izq, Botones der)
    panel.innerHTML = `
      ${cartelNuevoAdminHtml}
      ${alertaHtml}
      
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px; gap: 10px;">
        <div>
          <h3 style="margin:0; color:white; font-size:22px;">${b.address}</h3>
          <p style="color:gray; margin:2px 0;">${b.address2 || ""}</p>
        </div>
        <div style="display:flex; gap:6px; flex-shrink:0;">
          <button class="secondary" style="width:auto; min-height:38px; padding:6px 12px; font-size:13px; border-radius:8px; white-space:nowrap; background:#1e293b; color:#3b82f6; border-color:#1e3a8a;" onclick="abrirHistorialEdificio()">📜 Historial</button>
          <button class="secondary" style="width:auto; min-height:38px; padding:6px 12px; font-size:13px; border-radius:8px; white-space:nowrap;" onclick='abrirEditorEdificio(${JSON.stringify(b)})'>✏️ Editar</button>
        </div>
      </div>

      <div style="display: flex; gap: 14px; align-items: stretch; margin-bottom: 15px;">
        
        <div style="flex: 1; display: grid; grid-template-columns: 1fr; gap: 6px; font-size: 13px; background:#252525; padding:12px; border-radius:12px; color: #e4e4e7;">
          <div>🏢 <b>Nombre:</b> ${b.name || "-"}</div>
          <div>🗺️ <b>Territorio:</b> ${b.territory || "-"}</div>
          <div>🔢 <b>Pisos:</b> ${b.floors || 0}</div>
          <div>🚪 <b>Deptos/Piso:</b> ${b.unitsPerFloor || 0}</div>
          <div>🌱 <b>PB:</b> ${b.hasGroundFloor ? "Sí" : "No"} | 🛎️ <b>Portero:</b> ${b.hasDoorman ? "Sí" : "No"}</div>
        </div>

        <div id="contenedorMapaAdminSquare" style="width: 140px; height: 140px; flex-shrink: 0; position: relative;">
          <div id="miniMapaDetalle" style="width: 140px; height: 140px; border-radius: 12px; border: 1px solid #3f3f46; background:#181818;"></div>
        </div>

      </div>

      <h4 style="margin:10px 0 5px; color:#2196F3; font-size:16px;">🕒 Historial de Visitas e Información</h4>
      <div style="font-size:14px; background:#181818; padding:10px; border-radius:10px; max-height:180px; overflow-y:auto; border:1px solid #2b2b2b;">
        <p style="margin:0; color:#bdbdbd;">Última visita registrada: ${data.lastVisit ? new Date(data.lastVisit.date).toLocaleDateString('es-AR') : "Nunca"}</p>
        ${b.description ? `<p style="margin-top:8px; color:gray; font-style: italic;"><b>Descripción interna:</b> ${b.description}</p>` : ""}
      </div>
    `;

    if (miTemporizadorMapa) {
      clearTimeout(miTemporizadorMapa);
    }

    miTemporizadorMapa = setTimeout(() => {
      const miMapaReal = (typeof leafletMap !== 'undefined' && leafletMap !== null) ? leafletMap : 
                         (typeof map !== 'undefined' && map !== null) ? map : null;

      if (miMapaReal) {
        miMapaReal.invalidateSize({ animate: false });

        const latValida = parseFloat(b.latitude);
        const lngValida = parseFloat(b.longitude);
        
        const tieneCoordenadas = !isNaN(latValida) && !isNaN(lngValida) && isFinite(latValida) && latValida !== 0;

        // 📍 SI TIENE COORDENADAS: Renderizamos el mapa estático y acomodamos el mapa general
        if (tieneCoordenadas) {
          console.log(`📍 Inicializando mini-mapa estático para: ${latValida}, ${lngValida}`);
          
          miMapaReal.setView([latValida, lngValida], 16);

          if (miniMapaAdminInstance !== null) {
            try {
              miniMapaAdminInstance.remove();
              miniMapaAdminInstance = null;
            } catch (e) { console.warn("Error limpiando mapa anterior:", e); }
          }

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
              console.log("🟢 Mini-mapa estático cuadrado renderizado con éxito.");

            } catch (miniMapError) {
              console.error("Error creando el mini-mapa independiente:", miniMapError);
            }
          }, 50);

        // 🗺️ SI NO TIENE COORDENADAS PERO SÍ TERRITORIO: Centramos el mapa general al polígono
        } else if (b.territory && typeof misTerritoriosGeoJSON !== 'undefined' && misTerritoriosGeoJSON !== null) {
          try {
            let capaGeoJSONAdmin = L.geoJSON(misTerritoriosGeoJSON, {
              filter: function(feature) {
                const numeroTerritorio = feature.properties && (feature.properties.name || feature.properties.Territorio_N);
                return String(numeroTerritorio) === String(b.territory);
              }
            });

            if (capaGeoJSONAdmin.getLayers().length > 0) {
              console.log(`🗺️ [Territorio] Encuadrando BIEN DE CERCA en el Territorio ${b.territory}`);
              miMapaReal.fitBounds(capaGeoJSONAdmin.getBounds(), { 
                padding: [25, 25], 
                maxZoom: 16
              });
            }
          } catch (geoError) {
            console.warn("Fallo al encuadrar territorio:", geoError);
          }
          
          const minMapDiv = document.getElementById("miniMapaDetalle");
          if(minMapDiv) minMapDiv.innerHTML = `<p style="color:#71717a; font-size:11px; text-align:center; padding-top:55px; margin:0;">Falta geolocalización</p>`;

        } else {
          miMapaReal.setView([-27.36708, -55.89608], 15);
        }
          
      } else {
        console.warn("⚠️ No se encontró la variable del mapa.");
      }
    }, 100);

  } catch (error) {
    console.error("Error al cargar detalles del edificio:", error);
    panel.innerHTML = `<p style="color:red; text-align:center;">Error al conectar con los detalles del edificio.</p>`;
  }
}


// --- MÓDULO ADMINISTRACIÓN (ESTADÍSTICAS Y TABLAS) ---------------------------------------------------------------------------------

async function cargarDashboard() {
  try {
    // 1. Si la lista global aún no se descargó, la sincronizamos primero
    if (!window.todosLosEdificiosDB || window.todosLosEdificiosDB.length === 0) {
      const res = await apiFetch('/admin/buildings');
      if (res.ok) {
        const resData = await res.json();
        window.todosLosEdificiosDB = resData.data || resData || [];
      }
    }

    // 2. Definimos las variables para nuestras estadísticas
    const hoy = new Date();
    const MS_POR_DIA = 24 * 60 * 60 * 1000;

    let total = window.todosLosEdificiosDB.length;
    let visitadosHoy = 0;
    let nuncaVisitados = 0;
    let alertasActivas = 0;
    let bloqueados = 0;
    let nuevos30Dias = 0;

    // 3. Recorremos la base de datos real en memoria una sola vez
    window.todosLosEdificiosDB.forEach(edif => {
      // Contador de Bloqueados
      if (edif.isBlocked) {
        bloqueados++;
      }

      // Contador de Visitas Hoy
      if (edif.lastVisit || edif.ultimaVisita) {
        const fechaVisita = new Date(edif.lastVisit || edif.ultimaVisita);
        if (fechaVisita.toDateString() === hoy.toDateString()) {
          visitadosHoy++;
        }
      } else {
        nuncaVisitados++;
      }

      // Contador de Alertas Activas
      if (edif.hasIssue || edif.tieneProblema || edif.issue || edif.alerts) {
        alertasActivas++;
      }

      // Contador de Edificios Nuevos (Creados en los últimos 30 días)
      const fechaBase = edif.createdAt || edif.fechaCreacion;
      if (fechaBase) {
        const fechaCreacion = new Date(fechaBase);
        const diferenciaDias = Math.floor((hoy - fechaCreacion) / MS_POR_DIA);
        if (diferenciaDias <= 30 && diferenciaDias >= 0) {
          nuevos30Dias++;
        }
      }
    });

    // 4. Inyectamos los datos en los elementos del HTML (si existen en la vista actual)
    if (document.getElementById("totalEdificios")) {
      document.getElementById("totalEdificios").innerText = total;
    }
    if (document.getElementById("visitados")) {
      document.getElementById("visitados").innerText = visitadosHoy;
    }
    if (document.getElementById("nuncaVisitados")) {
      document.getElementById("nuncaVisitados").innerText = nuncaVisitados;
    }
    if (document.getElementById("problemasActivos")) {
      document.getElementById("problemasActivos").innerText = alertasActivas;
    }

    // ✨ NUEVAS MÉTRICAS: Agrega estos IDs en tus tarjetas del HTML si querés mostrarlos visualmente
    if (document.getElementById("edificiosBloqueados")) {
      document.getElementById("edificiosBloqueados").innerText = bloqueados;
    }
    if (document.getElementById("edificiosNuevos")) {
      document.getElementById("edificiosNuevos").innerText = nuevos30Dias;
    }

  } catch (error) {
    console.error("Error al cargar las estadísticas del Dashboard:", error);
  }
}

// Variable global para proteger los datos y que no se alteren al buscar
window.todosLosEdificiosDB = []; 
window.superAdminAutenticado = false;

// =========================================================================
// 🏢 FUNCIÓN: CARGAR EDIFICIOS (CON FIX DE DATOS REALES Y FILTRO COMPLETO)
// =========================================================================
async function cargarEdificios() {
  const listaContenedor = document.getElementById("listaEdificios");
  const paginadorAdmin = document.getElementById("paginadorAdmin");
  if (!listaContenedor) return;

  const busquedaInput = document.getElementById("busquedaDireccionAdmin");
  const territorioInput = document.getElementById("busquedaTerritorio");
  const filtroOrdenInput = document.getElementById("filtroOrden");

  const busqueda = busquedaInput ? busquedaInput.value.toLowerCase().trim() : "";
  const territorioFiltro = territorioInput ? territorioInput.value.trim() : "";
  const criterioOrden = filtroOrdenInput ? filtroOrdenInput.value : "address";

  try {
    // Si es la primera vez o la lista está vacía, buscamos de verdad al servidor
    if (!window.todosLosEdificiosDB || window.todosLosEdificiosDB.length === 0) {
      listaContenedor.innerHTML = `<p style="color:#71717a; text-align:center; padding:20px; font-size:13px;">Sincronizando base de datos...</p>`;
      const res = await apiFetch('/admin/buildings');
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      const resData = await res.json();
      
      // Guardamos TODOS los edificios (los 42 o los que existan) de forma segura
      window.todosLosEdificiosDB = resData.data || resData || [];
    }

    // Procesamos estadísticas SIEMPRE sobre el total real de la base de datos
    const hoy = new Date();
    let total = window.todosLosEdificiosDB.length;
    let visitadosHoy = 0;
    let nuncaVisitados = 0;
    let alertasActivas = 0;

    window.todosLosEdificiosDB.forEach(edif => {
      if (edif.lastVisit || edif.ultimaVisita) {
        const fechaVisita = new Date(edif.lastVisit || edif.ultimaVisita);
        if (fechaVisita.toDateString() === hoy.toDateString()) visitadosHoy++;
      } else {
        nuncaVisitados++;
      }
      if (edif.hasIssue || edif.tieneProblema || edif.issue || edif.alerts) alertasActivas++;
    });

    // Pintamos los paneles superiores con la verdad absoluta del servidor
    if (document.getElementById("totalEdificios")) document.getElementById("totalEdificios").innerText = total;
    if (document.getElementById("visitados")) document.getElementById("visitados").innerText = visitadosHoy;
    if (document.getElementById("nuncaVisitados")) document.getElementById("nuncaVisitados").innerText = nuncaVisitados;
    if (document.getElementById("problemasActivos")) document.getElementById("problemasActivos").innerText = alertasActivas;

    // 🌟 CONTROL DE ESTADO INICIAL: Si no buscó nada, mostramos el cartel de espera
    if (!busqueda && !territorioFiltro) {
      listaContenedor.innerHTML = `
        <p style="color:#71717a; text-align:center; padding:30px; font-size:13px; line-height:1.4;">
          🔍 Ingresá un criterio de búsqueda o seleccioná un territorio para desplegar los registros.
        </p>
      `;
      if (paginadorAdmin) paginadorAdmin.style.display = "none";
      return;
    }

    // Aplicamos los filtros en memoria sobre la lista completa blindada
    let edificiosFiltrados = [...window.todosLosEdificiosDB];

    if (busqueda) {
      edificiosFiltrados = edificiosFiltrados.filter(e => {
        const dir1 = (e.address || "").toLowerCase();
        const dir2 = (e.address2 || e.direccion2 || "").toLowerCase();
        const nom = (e.name || e.nombre || "").toLowerCase();
        const idStr = String(e._id || e.id || "").toLowerCase();
        return dir1.includes(busqueda) || dir2.includes(busqueda) || nom.includes(busqueda) || idStr.includes(busqueda);
      });
    }

    if (territorioFiltro) {
      edificiosFiltrados = edificiosFiltrados.filter(e => String(e.territory || e.territorio) === territorioFiltro);
    }

    // Ordenamiento
    if (criterioOrden === "address") {
      edificiosFiltrados.sort((a, b) => (a.address || "").localeCompare(b.address || ""));
    } else if (criterioOrden === "territory") {
      edificiosFiltrados.sort((a, b) => Number(a.territory || 0) - Number(b.territory || 0));
    }

    // Renderizado en la barra lateral
    listaContenedor.innerHTML = "";

    if (edificiosFiltrados.length === 0) {
      listaContenedor.innerHTML = `
        <p style="color:#71717a; text-align:center; padding:20px; font-size:13px;">
          ⚠️ No se encontraron edificios con "${busqueda || 'Territorio ' + territorioFiltro}".
        </p>
      `;
      if (paginadorAdmin) paginadorAdmin.style.display = "none";
      return;
    }

    if (paginadorAdmin) paginadorAdmin.style.display = "flex";

    edificiosFiltrados.forEach(edif => {
      // Si el edificio está bloqueado por el superadmin, le ponemos un estilo visual descriptivo
      const decoracionBloqueado = edif.isBlocked ? `<span style="color:#ef4444; font-size:11px; font-weight:bold;">🚫 BLOQUEADO</span>` : `Territorio: ${edif.territory || "-"}`;
      const tituloMostrar = edif.name || edif.nombre || edif.address || edif.direccion;

      const itemHTML = `
        <div class="edificio-item-lista" style="${edif.isBlocked ? 'border-left: 4px solid #ef4444;' : ''}" onclick="verDetalleEdificioAdmin('${edif._id || edif.id}')">
          <div class="edificio-info-txt">
            <span class="edif-dir">${tituloMostrar}</span>
            <span class="edif-sub">${edif.name ? edif.address : decoracionBloqueado}</span>
          </div>
          <span class="btn-ver-flecha">→</span>
        </div>
      `;
      listaContenedor.insertAdjacentHTML("beforeend", itemHTML);
    });

    if (typeof actualizarMarcadoresMapa === "function") {
      actualizarMarcadoresMapa(edificiosFiltrados);
    }

  } catch (error) {
    console.error("Error en cargarEdificios:", error);
    listaContenedor.innerHTML = `<p style="color:#f44336; text-align:center; padding:20px; font-size:13px;">Error de sincronización.</p>`;
  }
}

// =========================================================================
// 🔐 SECCIÓN: SEGURIDAD Y PANEL SUPERADMIN
// =========================================================================
// Variables de control para la paginación y búsqueda del SuperAdmin
window.superAdminAutenticado = false;
window.superAdminPaginaActual = 1;
window.superAdminFiltrados = [];
const ELEMENTOS_POR_PAGINA = 10;

function abrirAccesoSuperAdmin() {
  const clave = prompt("🔑 Ingrese la clave maestra de SuperAdmin para habilitar modificaciones críticas:");
  if (!clave) return;

  if (clave === "2414") {
    window.superAdminAutenticado = true;
    alert("✅ Autenticación exitosa. Desplegando listado maestro global.");
    // Copiamos la base de datos al array de trabajo del SuperAdmin
    window.superAdminFiltrados = [...window.todosLosEdificiosDB];
    window.superAdminPaginaActual = 1;
    mostrarPanelMaestroSuperAdmin();
  } else {
    alert("❌ Clave incorrecta. Acceso denegado.");
  }
}

function mostrarPanelMaestroSuperAdmin() {
  let superView = document.getElementById("superAdminView");
  if (!superView) {
    superView = document.createElement("div");
    superView.id = "superAdminView";
    superView.className = "vista-pantalla-completa";
    document.body.appendChild(superView);
  }

  superView.style.display = "block";

  // Calcular índices de paginación
  const inicio = (window.superAdminPaginaActual - 1) * ELEMENTOS_POR_PAGINA;
  const fin = inicio + ELEMENTOS_POR_PAGINA;
  const paginaElementos = window.superAdminFiltrados.slice(inicio, fin);
  const totalPaginas = Math.ceil(window.superAdminFiltrados.length / ELEMENTOS_POR_PAGINA) || 1;

  // Generar las filas de la tabla de forma segura
  let tablaFilas = "";
  if (paginaElementos.length === 0) {
    tablaFilas = `<tr><td colspan="4" style="text-align:center; padding:30px; color:#a1a1aa;">⚠️ No se encontraron edificios con ese criterio.</td></tr>`;
  } else {
    paginaElementos.forEach((b) => {
      tablaFilas += `
        <tr style="border-bottom: 1px solid #27272a;">
          <td style="padding:12px; font-size:13px;"><b>${b.name || 'Sin Nombre'}</b><br><span style="color:#a1a1aa; font-size:12px;">${b.address || b.direccion || ''}</span></td>
          <td style="padding:12px; text-align:center;">${b.territory || b.territorio || '-'}</td>
          <td style="padding:12px; text-align:center;">${b.isBlocked ? '🔴 Bloqueado' : '🟢 Activo'}</td>
          <td style="padding:12px; text-align:right; display:flex; gap:6px; justify-content:flex-end;">
            <button class="secondary" onclick="alert('Historial de visitas próximamente.')" style="padding:4px 8px; font-size:12px; cursor:pointer;">📋 Historial</button>
            <button class="secondary" onclick="cambiarBloqueoEdificio('${b._id || b.id}', ${b.isBlocked || false})" style="padding:4px 8px; font-size:12px; cursor:pointer; background-color:${b.isBlocked ? '#22c55e' : '#eab308'}; color:#000; font-weight:bold;">
              ${b.isBlocked ? '🔓 Desbloquear' : '🚫 Bloquear'}
            </button>
            <button class="danger" onclick="eliminarEdificioCrítico('${b._id || b.id}', '${b.address || b.direccion}')" style="padding:4px 8px; font-size:12px; background-color:#ef4444; color:white; border:none; border-radius:4px; cursor:pointer;">🗑️ BORRAR</button>
          </td>
        </tr>
      `;
    });
  }

  // Renderizar la estructura completa con el buscador y controles de página agregados
  superView.innerHTML = `
    <div style="padding:20px; max-width:1100px; margin:0 auto; background:#09090b; color:white; min-height:100vh; font-family:sans-serif;">
      
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid #27272a; padding-bottom:15px;">
        <div>
          <h2 style="margin:0; font-size:22px;">🛠️ Panel Maestro SuperAdmin</h2>
          <p style="margin:4px 0 0 0; color:#a1a1aa; font-size:13px;">Mostrando ${window.superAdminFiltrados.length} edificios en total</p>
        </div>
        <button onclick="document.getElementById('superAdminView').style.display='none'" class="secondary" style="background:#27272a; padding:8px 16px; border:none; color:white; border-radius:6px; cursor:pointer;">❌ Salir del Panel</button>
      </div>

      <div style="margin-bottom: 20px; display: flex; gap: 10px;">
        <input type="text" id="buscadorSuperAdmin" placeholder="Filtrar por dirección o nombre en tiempo real..." 
          style="flex: 1; padding: 10px; background: #18181b; border: 1px solid #27272a; color: white; border-radius: 6px; font-size: 14px;"
          oninput="filtrarSuperAdmin(this.value)">
      </div>

      <table style="width:100%; border-collapse:collapse; background:#18181b; border-radius:8px; overflow:hidden;">
        <thead>
          <tr style="background:#27272a; text-align:left; color:#a1a1aa;">
            <th style="padding:12px;">Edificio / Dirección</th>
            <th style="padding:12px; text-align:center;">Territorio</th>
            <th style="padding:12px; text-align:center;">Estado</th>
            <th style="padding:12px; text-align:right;">Acciones Autorizadas</th>
          </tr>
        </thead>
        <tbody>
          ${tablaFilas}
        </tbody>
      </table>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; padding:10px 0;">
        <span style="color:#a1a1aa; font-size:13px;">Página <b>${window.superAdminPaginaActual}</b> de <b>${totalPaginas}</b></span>
        <div style="display:flex; gap:8px;">
          <button onclick="cambiarPaginaSuper(-1)" ${window.superAdminPaginaActual === 1 ? 'disabled' : ''} 
            style="padding:6px 12px; background:#27272a; color:white; border:none; border-radius:4px; cursor:pointer; opacity:${window.superAdminPaginaActual === 1 ? '0.4' : '1'}">← Anterior</button>
          <button onclick="cambiarPaginaSuper(1)" ${window.superAdminPaginaActual === totalPaginas ? 'disabled' : ''} 
            style="padding:6px 12px; background:#27272a; color:white; border:none; border-radius:4px; cursor:pointer; opacity:${window.superAdminPaginaActual === totalPaginas ? '0.4' : '1'}">Siguiente →</button>
        </div>
      </div>

    </div>
  `;
}

// Función para filtrar sobre la marcha en el panel
function filtrarSuperAdmin(valor) {
  const query = valor.toLowerCase().trim();
  window.superAdminFiltrados = window.todosLosEdificiosDB.filter(b => {
    const dir = (b.address || b.direccion || "").toLowerCase();
    const nom = (b.name || b.nombre || "").toLowerCase();
    return dir.includes(query) || nom.includes(query);
  });
  window.superAdminPaginaActual = 1; // Reseteamos a la primera página al filtrar
  mostrarPanelMaestroSuperAdmin();
}

// Cambiar de página en el listado
function cambiarPaginaSuper(direccion) {
  window.superAdminPaginaActual += direccion;
  mostrarPanelMaestroSuperAdmin();
}

// 🛠️ FIX RUTA DE BLOQUEO (Evita el error 404)
async function cambiarBloqueoEdificio(id, estadoActual) {
  try {
    // Si la ruta original falló, intentamos enviar el cambio de estado usando PUT a la ruta del edificio
    const res = await apiFetch(`/admin/building/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isBlocked: !estadoActual })
    });
    
    // Si no tienes configurada esa ruta exacta en tu backend, probamos con la alternativa común:
    if (!res.ok) {
      const resAlt = await apiFetch(`/building/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBlocked: !estadoActual })
      });
      if (!resAlt.ok) throw new Error("No se pudo actualizar en el servidor");
    }

    alert("Estado de bloqueo modificado correctamente.");
    window.todosLosEdificiosDB = []; // Limpiamos caché para forzar recarga limpia
    await cargarEdificios();
    
    // Sincronizamos la vista del SuperAdmin con los nuevos datos
    const queryActual = document.getElementById("buscadorSuperAdmin") ? document.getElementById("buscadorSuperAdmin").value : "";
    window.superAdminFiltrados = [...window.todosLosEdificiosDB];
    if(queryActual) filtrarSuperAdmin(queryActual);
    else mostrarPanelMaestroSuperAdmin();

  } catch(e) { 
    console.error(e); 
    alert("Error de comunicación con el servidor. Verifica las rutas del backend.");
  }
}

async function eliminarEdificioCrítico(id, direccion) {
  if (!window.superAdminAutenticado) return;
  
  const conf1 = confirm(`⚠️ ADVERTENCIA CRÍTICA:\n¿Está seguro de que desea eliminar definitivamente el edificio en "${direccion}"?\nEsta acción es irreversible.`);
  if (!conf1) return;

  const confTexto = prompt(`🚨 CONFIRMACIÓN FINAL:\nEscriba la palabra "SI" para proceder:`);
  
  if (confTexto === "si") {
    try {
      const res = await apiFetch(`/admin/building/${id}`, { method: "DELETE" });
      if (res.ok) {
        alert("🗑️ Edificio eliminado con éxito.");
        window.todosLosEdificiosDB = []; // Forzar recarga completa
        await cargarEdificios();
        window.superAdminFiltrados = [...window.todosLosEdificiosDB];
        mostrarPanelMaestroSuperAdmin();
      } else {
        alert("Error en el servidor al intentar eliminar.");
      }
    } catch(e) { console.error(e); }
  }
}

// 👁️ ADAPTACIÓN DE LA FUNCIÓN QUE BORRA Y REDIBUJA LOS PUNTOS EN EL MAPA GENERAL
function actualizarMarcadoresMapa(edificios) {
  // Aseguramos que existan el mapa y las variables globales necesarias
  if (typeof mapaGeneral === 'undefined' || !mapaGeneral) return;

  // Si ya existía un grupo viejo de marcadores, lo limpiamos por completo
  if (typeof marcadoresClusterGlobal !== 'undefined' && marcadoresClusterGlobal) {
    mapaGeneral.removeLayer(marcadoresClusterGlobal);
  }

  // ✨ Creamos el nuevo Marker Cluster con tus preferencias visuales
  marcadoresClusterGlobal = L.markerClusterGroup({
    disableClusteringAtZoom: 16, // Al hacer zoom cercano (16), se desarman los bloques de números
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    
    // Icono estético personalizado para los números agrupados
    iconCreateFunction: function (cluster) {
      const cantidad = cluster.getChildCount();
      
      // Estilo de burbuja circular translúcida a tono con el Dark Mode
      return L.divIcon({
        html: `
          <div style="
            width: 38px; 
            height: 38px; 
            background: rgba(30, 30, 30, 0.85); 
            border: 2px solid #3f3f46; 
            color: #ffffff; 
            border-radius: 50%; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            font-size: 13px; 
            font-weight: 700; 
            box-shadow: 0 4px 10px rgba(0,0,0,0.4);
          ">
            ${cantidad}
          </div>
        `,
        className: 'custom-dark-cluster',
        iconSize: L.point(38, 38)
      });
    }
  });

  // Recorremos los edificios filtrados para poner los pines individuales dentro del cluster
  let bounds = L.latLngBounds();
  let tienePuntosValidos = false;

  edificios.forEach(e => {
    const lat = parseFloat(e.latitude || e.latitud);
    const lng = parseFloat(e.longitude || e.longitud);

    if (!isNaN(lat) && !isNaN(lng)) {
      const marcador = L.marker([lat, lng]).bindPopup(`<b>${e.address || "Edificio"}</b>`);
      marcadoresClusterGlobal.addLayer(marcador);
      bounds.extend([lat, lng]);
      tienePuntosValidos = true;
    }
  });

  // Agregamos el lote de marcadores renovados al mapa
  mapaGeneral.addLayer(marcadoresClusterGlobal);

  // Si no se filtró por territorio, pero sí hay marcadores en el mapa, ajustamos el encuadre general cerca
  const territorioInput = document.getElementById("busquedaTerritorio");
  const filtroTerritorioActivo = territorioInput ? territorioInput.value.trim() : "";

  if (tienePuntosValidos && !filtroTerritorioActivo) {
    mapaGeneral.fitBounds(bounds, { 
      padding: [40, 40], 
      maxZoom: 15 // Zoom óptimo inicial para ver todo el lote de Posadas sin alejarse a Encarnación
    });
  }
}

async function verListado() {
  abrirVista("editarView"); 
  try {
    const res = await apiFetch("/admin/buildings");
    const result = await res.json();
    let html = "";
    
    result.data.forEach(b => {
      html += `
        <div class="card-container" style="margin-bottom:10px;">
          <b>${b.address}</b><br>
          Territorio: ${b.territory || "-"}<br><br>
          <button class="secondary" onclick='abrirEditorEdificio(${JSON.stringify(b)})'>✏ Editar</button>
        </div>
      `;
    });
    
    document.getElementById("editarView").innerHTML = `
      <button class="secondary backModern" onclick="abrirVista('dashboardView')">← Volver</button>
      <h2>🏢 Edificios Totales</h2>
      ${html}
    `;
  } catch (error) {
    console.error(error);
  }
}






// ------------------------------------------------------------- ENVIAR NUEVO EDIFICIO O MODIFICACIONES ---



function crearEdificio() {
  abrirEditorEdificio();
}


async function guardarEdificio(id = null) {
  // Captura segura de datos
  const payload = {
    address: document.getElementById("edit_address")?.value || "",
    address2: document.getElementById("edit_address2")?.value || "",
    name: document.getElementById("edit_name")?.value || "",
    territory: document.getElementById("edit_territory")?.value || "",
    floors: parseInt(document.getElementById("edit_floors")?.value) || 0,
    unitsPerFloor: parseInt(document.getElementById("edit_units")?.value) || 0,
    latitude: parseFloat(document.getElementById("edit_lat")?.value) || null,
    longitude: parseFloat(document.getElementById("edit_lng")?.value) || null,
    hasGroundFloor: document.getElementById("edit_pb")?.checked || false,
    hasDoorman: document.getElementById("edit_portero")?.checked || false,
    description: document.getElementById("edit_description")?.value || ""
  };

  const url = id ? `/building/${id}` : "/building";
  const method = id ? "PUT" : "POST";

  // 🕵️‍♂️ AGREGÁ ESTA LÍNEA ACÁ PARA ESPIAR:
  console.log("📦 PAYLOAD QUE SALE AL SERVIDOR:", payload);

  try {
    const res = await apiFetch(url, {
      method: method,
      body: JSON.stringify(payload)
    });
    
    const data = await res.json().catch(() => ({}));
    
    if (res.ok) {
      alert("Edificio guardado exitosamente");
      
      // 🛡️ SINCRO INTELIGENTE POR ROL: Evita que el predi intente cargar rutas de admin
      if (currentRole === "admin") {
        if (typeof cargarEdificios === "function") await cargarEdificios();
        if (typeof mostrarInfoEdificio === "function") await mostrarInfoEdificio();
        abrirVista("dashboardView");
      } else if (currentRole === "predi") {
        // El predi no necesita recargar las listas globales del admin, regresa directo y limpio
        cancelarEdificioMovil();
      } else {
        // Por si acaso hay otro rol, cerramos por defecto
        cancelarEdificioMovil();
      }

    } else {
      alert("Error: " + (data.message || "Error desconocido en el servidor"));
    }
  } catch (error) {
    console.error("Error crítico al guardar el edificio:", error);
    alert("Error crítico en comunicación con servidor.");
  }
}

// 📐 EDITOR DINÁMICO COMPLETO CON CAPTURA VISUAL DE COORDENADAS
function abrirEditorEdificio(building = null) {
  abrirVista("editarView");
    // --- CORRECCIÓN DEFINITIVA DE CANCELAR ---
  // Si el rol es predi, el destino SIEMPRE debe ser volver al buscador móvil
  const funcionCancelar = (currentRole === "predi") ? "cancelarEdificioMovil()" : "abrirVista('dashboardView')";
  let html = `
    <div class="card-container">
      <h3>${building ? "✏ Editar edificio" : "➕ Nuevo edificio"}</h3>
      <input id="edit_address" placeholder="Dirección" value="${building?.address || (document.getElementById('buildingId')?.value || '')}">
      <input id="edit_address2" placeholder="Dirección 2" value="${building?.address2 || ''}">
      <input id="edit_name" placeholder="Nombre" value="${building?.name || ''}">
      <input id="edit_territory" placeholder="Territorio" value="${building?.territory || ''}">
      <input id="edit_floors" type="number" placeholder="Pisos" value="${building?.floors || ''}">
      <input id="edit_units" type="number" placeholder="Deptos por piso" value="${building?.unitsPerFloor || ''}">
      <input type="hidden" id="edit_lat" value="${building?.latitude || ''}">
      <input type="hidden" id="edit_lng" value="${building?.longitude || ''}">
      <label><input type="checkbox" id="edit_pb" ${building?.hasGroundFloor ? 'checked' : ''}> Planta baja</label>
      <label><input type="checkbox" id="edit_portero" ${building?.hasDoorman ? 'checked' : ''}> Portero</label>
      <textarea id="edit_description" placeholder="Descripción">${building?.description || ''}</textarea>
      <p style="font-size:14px; margin-top:10px; color:#bdbdbd;">📍 Tocá el mapa para ubicar o corregir el edificio:</p>
      <div id="map-editor" class="mapaBox" style="height:250px; margin-bottom:15px;"></div>
      <button class="ok" onclick='${building ? `guardarEdificio("${building._id}")` : `guardarEdificio()`}'>💾 Guardar</button>
      <button class="secondary" style="margin-top: 10px;" onclick="${funcionCancelar}">❌ Cancelar</button>
    </div>
  `;
  document.getElementById("editarView").innerHTML = `
    <button class="secondary backModern" onclick="${funcionCancelar}">← Volver</button>
    ${html}
  `;
  // Inicializar sub-mapa de coordenadas usando su contenedor propio
  setTimeout(() => {
    const defaultLat = -27.36708;
    const defaultLng = -55.89608;
    const initLat = building?.latitude || defaultLat;
    const initLng = building?.longitude || defaultLng;
    if (leafletMap) {
      leafletMap.remove();
      leafletMap = null;
      leafletMarker = null;
    }
    leafletMap = L.map('map-editor').setView([initLat, initLng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(leafletMap);

    if (building?.latitude && building?.longitude) {
      leafletMarker = L.marker([initLat, initLng]).addTo(leafletMap);
    }
    leafletMap.on('click', function(e) {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      document.getElementById('edit_lat').value = lat;
      document.getElementById('edit_lng').value = lng;
     if (leafletMarker) {
        leafletMarker.setLatLng(e.latlng);
      } else {
        leafletMarker = L.marker(e.latlng).addTo(leafletMap);
      }
   // --- DETECTOR DINÁMICO DE ZOOM PARA LOS NÚMEROS DE TERRITORIO (Quita el enjambre) ---
    leafletMap.on('zoomend', function() {
      const zoomActual = leafletMap.getZoom();
      const etiquetas = document.querySelectorAll('.texto-territorio-elegante');
      
      etiquetas.forEach(etiqueta => {
        // En zoom 13 o menos (como en tu foto que se ve todo Encarnación y Posadas), se ocultan.
        // En zoom 14 o más (cuando ya te acercás a las avenidas), aparecen impecables.
        if (zoomActual <= 13) {
          etiqueta.classList.add('zoom-alejado');
        } else {
          etiqueta.classList.remove('zoom-alejado');
        }
      });
    }); 
    });
  }, 200);
}

function cambiarTabFiltro(tipo) {
    // 1. Alternar clases activas en los botones estilizados
    const tabDirBtn = document.getElementById('tabDirBtn');
    const tabTerrBtn = document.getElementById('tabTerrBtn');
    if (tabDirBtn) tabDirBtn.classList.toggle('active', tipo === 'direccion');
    if (tabTerrBtn) tabTerrBtn.classList.toggle('active', tipo === 'territorio');
    
    // 2. Traer los contenedores de inputs
    const contDireccion = document.getElementById('tabContenidoDireccion');
    const contTerritorio = document.getElementById('tabContenidoTerritorio');
    
    // 3. Activar el contenedor correcto y limpiar el opuesto
    if (tipo === 'direccion') {
        if (contDireccion) contDireccion.classList.add('active');
        if (contTerritorio) contTerritorio.classList.remove('active');
        
        // Resetea el número asegurándose de que el input exista en pantalla
        const inputTerr = document.getElementById('busquedaTerritorio');
        if (inputTerr) inputTerr.value = ''; 
    } else {
        if (contDireccion) contDireccion.classList.remove('active');
        if (contTerritorio) contTerritorio.classList.add('active');
        
        // Resetea el texto asegurándose de que el input exista en pantalla
        const inputDir = document.getElementById('busquedaDireccionAdmin');
        if (inputDir) inputDir.value = ''; 
    }
    
    // 4. Invocar la recarga de datos si la función existe
    if (typeof cargarEdificios === 'function') {
        cargarEdificios();
    }
}

// 🗺️ FUNCIÓN ENCARGADA DE INYECTAR MAPAS Y CAPAS GEOJSON (Corregida sin carteles molestos y con números elegantes)
function inicializarMapaLeaflet(lat, lng, address = null) {
  const defaultLat = -27.36708; // Posadas, Misiones
  const defaultLng = -55.89608;
  
  const mapaLat = lat || defaultLat;
  const mapaLng = lng || defaultLng;

  if (leafletMap) {
    leafletMap.remove();
    leafletMap = null;
    leafletMarker = null;
  }

  setTimeout(() => {
    const mapDiv = document.getElementById('map');
    if (!mapDiv) return;

    leafletMap = L.map('map').setView([mapaLat, mapaLng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(leafletMap);

    // Función auxiliar para generar un color pastel aleatorio en formato HEX
    function generarColorPastelAleatorio() {
      const r = Math.floor((Math.random() * 127) + 128).toString(16).padStart(2, '0');
      const g = Math.floor((Math.random() * 127) + 128).toString(16).padStart(2, '0');
      const b = Math.floor((Math.random() * 127) + 128).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }

    // DIBUJAR LOS POLÍGONOS DE TERRITORIOS CARGADOS DESDE TERRITORIOS.JS
    if (typeof misTerritoriosGeoJSON !== 'undefined') {
      L.geoJSON(misTerritoriosGeoJSON, {
        style: function(feature) {
          const colorAleatorio = generarColorPastelAleatorio();
          return {
            color: colorAleatorio,       // Color del borde
            weight: 2,                   // Grosor del borde
            opacity: 0.9,
            fillColor: colorAleatorio,   // Color del relleno pastel
            fillOpacity: 0.35            
          };
        },
        onEachFeature: function (feature, layer) {
          const numeroTerritorio = feature.properties && (feature.properties.name || feature.properties.Territorio_N);
          
          if (numeroTerritorio) {
            // 1. Popup normal al hacerle clic al polígono
            layer.bindPopup(`<b>Territorio N° ${numeroTerritorio}</b>`);

            // 2. 💎 NÚMERO ELEGANTE Y PERMANENTE EN EL CENTRO DE CADA POLÍGONO
            layer.bindTooltip(String(numeroTerritorio), {
              permanent: true,        // Se queda fijo en el mapa
              direction: 'center',    // Centrado geométrico
              className: 'texto-territorio-elegante' // Clase CSS personalizada
            });
          }
          // Efecto visual al pasar el mouse por encima
          layer.on('mouseover', function () { this.setStyle({ fillOpacity: 0.60 }); });
          layer.on('mouseout', function () { this.setStyle({ fillOpacity: 0.35 }); });
        }
      }).addTo(leafletMap);
    }

    // AGREGAR MARCADOR ÚNICO (Solo si te pasaron una dirección real, no al abrir de cero)
    if (lat && lng && address) {
      leafletMarker = L.marker([lat, lng]).addTo(leafletMap)
        .bindPopup(`<b>${address}</b>`)
        .openPopup(); // Este sí se abre porque es un edificio seleccionado real
    }
    // --- DETECTOR DINÁMICO DE ZOOM PARA LOS NÚMEROS DE TERRITORIO ---
    leafletMap.on('zoomend', function() {
      const zoomActual = leafletMap.getZoom();
      // Buscamos todos los cartelitos de territorio en la pantalla
      const elementosEtiqueta = document.querySelectorAll('.texto-territorio-elegante');
      elementosEtiqueta.forEach(elemento => {
        if (zoomActual >= 15) {
          // Si está cerca, le ponemos la ropa elegante de gala
          elemento.classList.add('vista-cerca');
        } else {
          // Si se aleja, le quitamos el fondo y lo achicamos
          elemento.classList.remove('vista-cerca');
        }
      });
    });
  }, 50);
}


// --- AUXILIARES Y LIMPIEZA DE INTERFAZ ---
// Función auxiliar para cuando el usuario móvil cancela la creación
function cancelarEdificioMovil() {
  const editarView = document.getElementById("editarView");
  const mainDashboard = document.getElementById("mainDashboard");
  const appContainer = document.getElementById("appContainer");
  
  if (editarView) editarView.classList.remove("active");
  
  // 🛡️ Evitamos el error null protegiendo con condicionales:
  if (mainDashboard) mainDashboard.style.display = "none";
  if (appContainer) appContainer.style.display = "block";
  
  limpiarVista();
  
  if (typeof mensajeInicial !== 'undefined' && mensajeInicial) {
    mensajeInicial.style.display = "block";
  }
}

function normalizarDireccion(dir) {
  return dir
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bav\b|\bav\.\b/g, "avenida")
    .replace(/\bgral\b/g, "general")
    .replace(/\bdr\b|\bdr\.\b/g, "doctor")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function limpiarVista() {
  
  resultado.innerText = "";
  infoEdificio.style.display = "none";
  nota.style.display = "none";
  btnOk.style.display = "none";
  btnNo.style.display = "none";
  btnSiguiente.style.display = "none";
  btnNuevoEdificio.style.display = "none";
  reportBtn.style.display = "none";
  const miniMapaDiv = document.getElementById("miniMapaPredi");
  if (miniMapaDiv) miniMapaDiv.style.display = "none";
  if (prediMiniMap) {
    prediMiniMap.remove();
    prediMiniMap = null;
  }
}
function paginaAnterior() {
  if (paginaActual > 1) {
    paginaActual--;
    cargarEdificios();
  }
}
function paginaSiguiente() {
  paginaActual++;
  cargarEdificios();
}
// 💾 Función genérica para guardar elementos en el localStorage del teléfono
function guardarEnMochilaLocal(clave, datos) {
  let listado = JSON.parse(localStorage.getItem(clave)) || [];
  // Le agregamos una marca de tiempo para saber cuándo se tomó por las dudas
  datos.guardadoEnLocalEl = new Date().toISOString(); 
  listado.push(datos);
  localStorage.setItem(clave, JSON.stringify(listado));
}

// 📡 El "Vigilante" del Internet: Se dispara solo cuando el celular recupera conexión
window.addEventListener('online', async () => {
  const visitasPendientes = JSON.parse(localStorage.getItem("visitas_pendientes")) || [];
  const reportesPendientes = JSON.parse(localStorage.getItem("reportes_pendientes")) || [];

  if (visitasPendientes.length === 0 && reportesPendientes.length === 0) return;

  console.log(`📡 Conexión recuperada. Sincronizando: ${visitasPendientes.length} visitas y ${reportesPendientes.length} reportes...`);

  let erroresCarga = false;

  // 1. Despachamos las visitas retenidas
  if (visitasPendientes.length > 0) {
    const visitasNoEnviadas = [];
    for (let visita of visitasPendientes) {
      try {
        const res = await apiFetch("/visit", { method: "POST", body: JSON.stringify(visita) });
        if (!res.ok) throw new Error();
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

  // 2. Despachamos los reportes (issues) retenidos
  if (reportesPendientes.length > 0) {
    const reportesNoEnviados = [];
    for (let reporte of reportesPendientes) {
      try {
        const res = await apiFetch("/issues", { method: "POST", body: JSON.stringify(reporte) });
        if (!res.ok) throw new Error();
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

  // Avisamos con un cartel sutil al usuario si todo se sincronizó bien
  if (!erroresCarga) {
    alert("🔄 ¡Datos sincronizados! Las visitas y reportes tomados sin internet ya se subieron al servidor con éxito.");
    // Opcional: Si estás en el panel admin, refrescamos la vista
    if (typeof cargarEdificios === "function") cargarEdificios();
  }
});
