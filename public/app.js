/**
 * APP.JS - Lógica de Control y Conexión con la API
 * Sistema de Gestión de Territorios y Visitas
 */
// --- VARIABLES GLOBALES DEL NAVEGADOR ---
let paginaActual = 1;
let currentDept = null;
let currentUser = null;
let currentRole = null;
let currentBuildingId = null;
let prediMiniMap = null; 
let leafletMap = null;
let leafletMarker = null;
let miTemporizadorMapa = null; // Guardián para que no se pisen los clics de los edificios
let miniMapaAdminInstance = null;

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


async function buscar() {
  limpiarVista();
  const input = normalizarDireccion(buildingId.value);
  if (!input) return;
  
  mensajeInicial.style.display = "none";
  resultado.innerText = "Buscando...";

  try {
    const b = await apiFetch(`/building/${encodeURIComponent(input)}`);
    
    // --- NUEVA VALIDACIÓN ADAPTADA PARA MANEJAR EL 404 DEL SERVIDOR ---
    if (!b.ok) {
      if (b.status === 404) {
        resultado.innerText = "Edificio no encontrado";
        btnNuevoEdificio.style.display = "block";
        btnNuevoEdificio.onclick = function() {
          crearEdificio();
        };
        return;
      }
      throw new Error(`Error en servidor: ${b.status}`);
    }
    const building = await b.json();
    if (!building || !building._id) {
      resultado.innerText = "Edificio no encontrado";
      btnNuevoEdificio.style.display = "block";
      btnNuevoEdificio.onclick = function() {
        crearEdificio();
      };
      return;
    }
    currentBuildingId = building._id;
    await cargarDepto();
    } catch (error) {
    console.error("Detalle del error en buscar:", error);
    // Si la API falló con 404 pero saltó al catch por el fetch nativo, también le damos la opción de crear
    resultado.innerText = "Edificio no encontrado o error de red";
    btnNuevoEdificio.style.display = "block";
    btnNuevoEdificio.onclick = function() {
      crearEdificio();
    };
  }
}

async function buscarPorTerritorio() {
  limpiarVista();
  const territorio = prompt("Número de territorio:");
  if (!territorio) return;

  try {
    const res = await apiFetch(`/territory/${territory}`);
    const data = await res.json();
    
    if (!data.length) {
      listaTerritorio.innerHTML = "<p style='text-align:center;'>No hay edificios asignados</p>";
      return;
    }
    
    listaTerritorio.innerHTML = "";
    data.forEach(b => {
      const btn = document.createElement("button");
      btn.innerText = b.address;
      btn.onclick = () => {
        currentBuildingId = b._id;
        cargarDepto();
      };
      listaTerritorio.appendChild(btn);
    });
  } catch (error) {
    console.error(error);
  }
}

async function cargarDepto() {
  try {
    const res = await apiFetch(`/next/${currentBuildingId}`);
    const data = await res.json();
    
    listaTerritorio.innerHTML = "";

    if (data.message === "NO_AVAILABLE" || !data.dept) {
      resultado.innerText = "No hay departamentos disponibles o terminaste el edificio";
      nota.style.display = "none";
      btnOk.style.display = "none";
      btnNo.style.display = "none";
      btnSiguiente.style.display = "none";
      await mostrarInfoEdificio();
      return;
    }

    currentDept = data.dept;
    resultado.innerHTML = `
      <div style="margin-top:18px; text-align:center;">
        <div style="font-size:18px; color:#9e9e9e; margin-bottom:10px;">Departamento</div>
        <div style="font-size:72px; font-weight:bold; color:white; line-height:1; text-shadow: 0 5px 20px rgba(0,0,0,.35);">${data.dept.number}</div>
      </div>
    `;
    
    nota.style.display = "block";
    btnOk.style.display = "block";
    btnNo.style.display = "block";
    reportBtn.style.display = "block";
    btnOk.disabled = false;
    btnNo.disabled = false;
    btnSiguiente.style.display = "none";
    
    await mostrarInfoEdificio();
  } catch (error) {
    console.error(error);
    resultado.innerText = "Error al cargar el departamento";
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
        cartelNuevoHtml = `<div style="background:#1e3a8a; color:#93c5fd; border: 1px solid #2563eb; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 600; margin-bottom: 10px; display: inline-block;">🏢 Edificio creado el ${fechaFormateada}</div>`;
      }
    }

    // Buscamos el botón de reportes original (si existía como elemento flotante en el HTML, lo ocultamos para usar el integrado)
    if (typeof reportBtn !== 'undefined' && reportBtn) {
      reportBtn.style.display = "none"; 
    }

    // Estilo limpio e integrado tipo Admin para el Predicador
    infoEdificio.style.display = "block";
    infoEdificio.innerHTML = `
      <div class="sectionCard" style="background: #1e1e1e; border: 1px solid #2b2b2b; padding: 16px; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
        ${cartelNuevoHtml}
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; margin-bottom: 12px;">
          <div>
            <div style="font-size:22px; font-weight:bold; color:white; line-height:1.2;">${b.address}</div>
            <div style="color:#a1a1aa; font-size:13px; margin-top:4px;">${b.address2 || "Sin datos adicionales"}</div>
          </div>
          <div style="background:#2b2b2b; padding:6px 10px; border-radius:10px; font-size:12px; font-weight:600; white-space:nowrap; color:#e4e4e7;">🏢 ${b.name || "Edificio"}</div>
        </div>

        <div id="miniMapaPredi" class="mapaBox" style="display:block; height: 150px; margin: 12px 0; border-radius:12px; pointer-events: none; border: 1px solid #3f3f46;"></div>
        
        <div style="margin-top:14px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
          <div style="background:#27272a; color:#d4d4d8; padding:8px 12px; border-radius:10px; font-size:12px; font-weight:500;">
            🕒 Última visita: ${data.lastVisit ? new Date(data.lastVisit.date).toLocaleDateString() : "Nunca"}
          </div>
          
          <button onclick="abrirReporte()" style="width:auto; min-height:34px; background:#3f1f1f; color:#f87171; border:1px solid #ef4444; padding:6px 12px; border-radius:10px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:6px; margin:0;">
            ⚠️ Algo pasa
          </button>
        </div>

        ${data.issue ? `
          <div style="background:#451a1a; color:#fca5a5; border:1px solid #b91c1c; padding:10px; border-radius:10px; margin-top:12px; font-size:12px; font-weight:500;">
            ⚠ <b>Alerta activa (${data.issue.type}):</b> ${data.issue.description || "Sin detalles"}
          </div>
        ` : ""}
      </div>
    `;

    // --- RENDERIZACIÓN DEL MAPA CON FILTRADO O COORDENADAS ---
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

      // Opción A: Si tiene coordenadas, ponemos marcador
      if (b.latitude && b.longitude) {
        const lat = parseFloat(b.latitude);
        const lng = parseFloat(b.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          L.marker([lat, lng]).addTo(prediMiniMap);
          prediMiniMap.setView([lat, lng], 16);
          centradoExitoso = true;
        }
      }

      // Opción B: Si falla o no tiene, pero hay territorio informado, mostramos el polígono del territorio
      if (!centradoExitoso && b.territory && typeof misTerritoriosGeoJSON !== 'undefined' && misTerritoriosGeoJSON) {
        let capaGeoJSON = L.geoJSON(misTerritoriosGeoJSON, {
          filter: (f) => String(f.properties.name || f.properties.Territorio_N) === String(b.territory),
          style: { color: '#2196F3', weight: 2, fillColor: '#2196F3', fillOpacity: 0.15 }
        }).addTo(prediMiniMap);

        if (capaGeoJSON.getLayers().length > 0) {
          prediMiniMap.fitBounds(capaGeoJSON.getBounds(), { padding: [10, 10] });
          centradoExitoso = true;
        }
      }

      // Caída por defecto si no hay nada de info geográfica
      if (!centradoExitoso) {
        prediMiniMap.setView([-27.36708, -55.89608], 14);
      }

      setTimeout(() => { if (prediMiniMap) prediMiniMap.invalidateSize(); }, 200);
    }
  } catch (error) {
    console.error("Error en mostrarInfoEdificio:", error);
  }
}

async function marcar(status) {
  if (!currentDept) return;
  btnOk.disabled = true;
  btnNo.disabled = true;
  
  try {
    await apiFetch("/visit", {
      method: "POST",
      body: JSON.stringify({
        departmentId: currentDept._id,
        status: status,
        note: nota.value
      })
    });
    
    btnSiguiente.style.display = "block";
  } catch (error) {
    console.error(error);
    btnOk.disabled = false;
    btnNo.disabled = false;
  }
}

async function siguiente() {
  nota.value = "";
  await cargarDepto();
}
//---------------------------------------------------------------------------------------------//

// --- MÓDULO REPORTES DE PROBLEMAS ---
function abrirReporte() { modalReporte.style.display = "flex"; }
function cerrarReporte() { modalReporte.style.display = "none"; }
async function enviarReporte() {
  // 1. Validar que el usuario haya escrito algo antes de enviar
  const descripcion = descProblema.value.trim();
  if (!descripcion) {
    alert("Por favor, escribe los detalles del problema antes de enviar.");
    return;
  }
  try {
    // Apuntamos a la ruta "/issues" que ya tenías definida
    const res = await apiFetch("/issues", {
      method: "POST",
      body: JSON.stringify({
        buildingId: currentBuildingId,
        departmentId: currentDept?._id || null, // Aseguramos un null si no hay depto
        type: tipoProblema.value,
        description: descripcion
      })
    });
    // 2. Controlar si el servidor realmente aceptó el reporte
    if (res.ok) {
      cerrarReporte();
      descProblema.value = "";
      alert("Reporte enviado con éxito");
      await mostrarInfoEdificio();
    } else {
      // Intentamos leer el mensaje de error del servidor si existe
      const errorData = await res.json().catch(() => ({}));
      alert("No se pudo enviar el reporte: " + (errorData.error || "Error en el servidor"));
    }
  } catch (error) {
    console.error("Error crítico al enviar reporte:", error);
    alert("Error crítico de comunicación. Revisa tu conexión.");
  }
}

async function verProblemas() {
  try {
    const res = await apiFetch("/issues");
    const data = await res.json();
    let html = "";
    
    if(!data.length) {
      html = "<p style='padding:15px; color:gray;'>No hay problemas reportados pendientes.</p>";
    }

    data.forEach(i => {
      html += `
        <div class="card-container" style="margin-bottom:10px;">
          <b style="color:#ff8a80;">⚠️ ${i.type}</b><br>
          <small style="color:gray;">Edificio ID: ${i.buildingId}</small><br>
          <p style="margin-top:5px;">${i.description || "Sin descripción"}</p>
        </div>
      `;
    });
    
    const probView = document.getElementById("problemasView");
    probView.innerHTML = `
      <button class="secondary backModern" onclick="abrirVista('dashboardView')">← Volver</button>
      <h2>⚠ Problemas Reportados</h2>
      ${html}
    `;
  } catch (error) {
    console.error(error);
  }
}


// Nueva función centralizada para auditar un edificio (Detalles, Alertas, Historial y Editar)
async function verDetalleEdificioAdmin(buildingId) {
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

    panel.innerHTML = `
      ${cartelNuevoAdminHtml}
      ${alertaHtml}
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px;">
        <div>
          <h3 style="margin:0; color:white; font-size:22px;">${b.address}</h3>
          <p style="color:gray; margin:2px 0;">${b.address2 || ""}</p>
        </div>
        <button class="secondary" style="width:auto; min-height:38px; padding:6px 12px; font-size:14px; border-radius:8px;" onclick='abrirEditorEdificio(${JSON.stringify(b)})'>✏️ Editar</button>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:14px; background:#252525; padding:12px; border-radius:12px; margin-bottom:15px;">
        <div>🏢 <b>Nombre:</b> ${b.name || "-"}</div>
        <div>🗺️ <b>Territorio:</b> ${b.territory || "-"}</div>
        <div>🔢 <b>Pisos:</b> ${b.floors || 0}</div>
        <div>🚪 <b>Deptos/Piso:</b> ${b.unitsPerFloor || 0}</div>
        <div>🌱 <b>Planta Baja:</b> ${b.hasGroundFloor ? "Sí" : "No"}</div>
        <div>🛎️ <b>Portero:</b> ${b.hasDoorman ? "Sí" : "No"}</div>
      </div>
      <h4 style="margin:10px 0 5px; color:#2196F3; font-size:16px;">🕒 Historial de Visitas e Información</h4>
      <div style="font-size:14px; background:#181818; padding:10px; border-radius:10px; max-height:180px; overflow-y:auto; border:1px solid #2b2b2b;">
        <p style="margin:0; color:#bdbdbd;">Última visita registrada: ${data.lastVisit ? new Date(data.lastVisit.date).toLocaleDateString() : "Nunca"}</p>
        ${b.description ? `<p style="margin-top:8px; color:gray;"><b>Descripción interna:</b> ${b.description}</p>` : ""}
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

        if (tieneCoordenadas) {
          console.log(`📍 Inicializando mini-mapa estático para: ${latValida}, ${lngValida}`);
          
          if (miniMapaAdminInstance !== null) {
            try {
              miniMapaAdminInstance.remove();
              miniMapaAdminInstance = null;
            } catch (e) { console.warn("Error limpiando mapa anterior:", e); }
          }

          const panelDetalle = document.getElementById("panelDetalleEdificio");
          if (panelDetalle) {
            const mapaViejo = document.getElementById("miniMapaDetalle");
            if (mapaViejo) mapaViejo.remove();

            const contenedorMapaHTML = document.createElement("div");
            contenedorMapaHTML.id = "miniMapaDetalle";
            contenedorMapaHTML.style.width = "100%";
            contenedorMapaHTML.style.height = "220px";
            contenedorMapaHTML.style.borderRadius = "12px";
            contenedorMapaHTML.style.marginTop = "15px";
            contenedorMapaHTML.style.boxShadow = "0 4px 10px rgba(0,0,0,0.3)";
            
            panelDetalle.appendChild(contenedorMapaHTML);
          }

          setTimeout(() => {
            try {
              miniMapaAdminInstance = L.map('miniMapaDetalle', {
                center: [latValida, lngValida],
                zoom: 17,
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
              console.log("🟢 Mini-mapa estático renderizado con éxito.");

            } catch (miniMapError) {
              console.error("Error creando el mini-mapa independiente:", miniMapError);
            }
          }, 100);

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
                padding: [5, 5], 
                maxZoom: 16 
              });
            }
          } catch (geoError) {
            console.warn("Fallo al encuadrar territorio:", geoError);
          }
        } else {
          miMapaReal.setView([-27.36708, -55.89608], 14);
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
    const res = await apiFetch("/stats");
    const data = await res.json();
    totalEdificios.innerText = data.totalEdificios || 0;
    visitados.innerText = data.visitados || 0;
  } catch (error) {
    console.error(error);
  }
}

async function cargarEdificios() {
  // 1. Buscamos el contenedor de la lista en el HTML
  const listaContenedor = document.getElementById("listaEdificios");
  if (!listaContenedor) return;

  try {
    // 2. Traemos los edificios directamente desde tu servidor usando la ruta real comprobada
    listaContenedor.innerHTML = `<p style="color:#71717a; text-align:center; padding:20px; font-size:13px;">Cargando edificios...</p>`;
    
    // Apuntamos al endpoint correcto de tu servidor backend
    const res = await apiFetch('/admin/buildings'); 
    if (!res.ok) throw new Error(`Error en el servidor: ${res.status}`);
    
    // Desempaquetamos la propiedad .data que envía tu servidor
    const resData = await res.json();
    const edificiosListaGlobal = resData.data || []; 
    let edificiosFiltrados = [...edificiosListaGlobal];

    // 3. OBTENER FILTROS DEL HTML
    const busquedaInput = document.getElementById("busquedaDireccionAdmin");
    const territorioInput = document.getElementById("busquedaTerritorio");
    const filtroOrdenInput = document.getElementById("filtroOrden");

    const busqueda = busquedaInput ? busquedaInput.value.toLowerCase().trim() : "";
    const territorioFiltro = territorioInput ? territorioInput.value.trim() : "";
    const criterioOrden = filtroOrdenInput ? filtroOrdenInput.value : "address";

    // 4. CONFIGURACIÓN PARA EDIFICIOS NUEVOS (Lapso de 30 días)
    const MS_POR_DIA = 24 * 60 * 60 * 1000;
    const hoy = new Date();

    // 5. CALCULAR ESTADÍSTICAS REALES (Usando los campos de tu Base de Datos)
    let total = edificiosListaGlobal.length;
    let visitadosHoy = 0;
    let nuncaVisitados = 0;
    let alertasActivas = 0;

    edificiosListaGlobal.forEach(edif => {
      // Control de Visitas
      if (edif.lastVisit || edif.ultimaVisita) {
        const fechaVisita = new Date(edif.lastVisit || edif.ultimaVisita);
        if (fechaVisita.toDateString() === hoy.toDateString()) {
          visitadosHoy++;
        }
      } else {
        nuncaVisitados++;
      }

      // Control de Alertas
      if (edif.hasIssue || edif.tieneProblema || edif.issue) {
        alertasActivas++;
      }
    });

    // Inyectamos las estadísticas en las mini-tarjetas del panel administrativo
    if (document.getElementById("totalEdificios")) document.getElementById("totalEdificios").innerText = total;
    if (document.getElementById("visitados")) document.getElementById("visitados").innerText = visitadosHoy;
    if (document.getElementById("nuncaVisitados")) document.getElementById("nuncaVisitados").innerText = nuncaVisitados;
    if (document.getElementById("problemasActivos")) document.getElementById("problemasActivos").innerText = alertasActivas;

    // 6. APLICAR FILTROS DE BÚSQUEDA Y TERRITORIO
    if (busqueda) {
      edificiosFiltrados = edificiosFiltrados.filter(e => (e.address || e.direccion || "").toLowerCase().includes(busqueda));
    }
    if (territorioFiltro) {
      edificiosFiltrados = edificiosFiltrados.filter(e => String(e.territory || e.territorio) === territorioFiltro);
    }

    // 7. ORDENAR LA LISTA
    if (criterioOrden === "address" || criterioOrden === "Orden Alfabético") {
      edificiosFiltrados.sort((a, b) => (a.address || "").localeCompare(b.address || ""));
    } 
    else if (criterioOrden === "territory" || criterioOrden === "Territorio") {
      edificiosFiltrados.sort((a, b) => Number(a.territory || 0) - Number(b.territory || 0));
    } 
    else if (criterioOrden === "recent" || criterioOrden === "Nuevos") {
      edificiosFiltrados.sort((a, b) => {
        const fechaA = a.createdAt || a.fechaCreacion ? new Date(a.createdAt || a.fechaCreacion) : new Date(0);
        const fechaB = b.createdAt || b.fechaCreacion ? new Date(b.createdAt || b.fechaCreacion) : new Date(0);
        return fechaB - fechaA;
      });
    }

    // 8. RENDERIZAR EN EL HTML
    listaContenedor.innerHTML = "";

    if (edificiosFiltrados.length === 0) {
      listaContenedor.innerHTML = `<p style="color:#71717a; text-align:center; padding:20px; font-size:13px;">No se encontraron edificios</p>`;
      return;
    }

    edificiosFiltrados.forEach(edif => {
      let descripcionExtra = `Territorio: ${edif.territory || edif.territorio || "-"}`;
      
      // Identificamos novedades
      const fechaBase = edif.createdAt || edif.fechaCreacion;
      if (fechaBase) {
        const fechaCreacion = new Date(fechaBase);
        const diferenciaDias = Math.floor((hoy - fechaCreacion) / MS_POR_DIA);

        if (diferenciaDias <= 30 && diferenciaDias >= 0) {
          const fechaFormateada = fechaCreacion.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
          descripcionExtra = `✨ Creado el ${fechaFormateada}`;
        }
      }

      // Inyectamos fila
      const itemHTML = `
        <div class="edificio-item-lista" onclick="verDetalleEdificioAdmin('${edif.id || edif._id}')">
          <div class="edificio-info-txt">
            <span class="edif-dir">${edif.address || edif.direccion}</span>
            <span class="edif-sub">${descripcionExtra}</span>
          </div>
          <span class="btn-ver-flecha">→</span>
        </div>
      `;
      listaContenedor.insertAdjacentHTML("beforeend", itemHTML);
    });

    // 9. Actualizar marcadores del mapa si la función existe
    if (typeof actualizarMarcadoresMapa === "function") {
      actualizarMarcadoresMapa(edificiosFiltrados);
    }

  } catch (error) {
    console.error("Error en cargarEdificios:", error);
    listaContenedor.innerHTML = `<p style="color:#f44336; text-align:center; padding:20px; font-size:13px;">Error al conectar con el servidor.</p>`;
  }
}
async function buscarTerritorioAdmin() {
  const t = territorioAdminInput.value.trim();
  if (!t) return;
  
  territorioResultados.innerHTML = `
    <div class="card-container skeleton">
      <div class="skeletonLine"></div>
      <div class="skeletonLine"></div>
    </div>
  `;
  
  try {
    const res = await apiFetch(`/territory/${t}`);
    const data = await res.json();
    let html = "";
    
    if(!data.length) {
      territorioResultados.innerHTML = "<p style='color:gray;'>Este territorio no tiene edificios cargados.</p>";
      return;
    }

    data.forEach(b => {
      const addrEscaped = b.address.replace(/'/g, "\\'");
      html += `
        <div class="card-container" style="margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <b>${b.address}</b><br>
            🗺 Territorio N° ${b.territory || "-"}
          </div>
          <button class="buscar" style="width:auto; min-height:40px; padding:10px;" onclick="inicializarMapaLeaflet(${b.latitude || null}, ${b.longitude || null}, '${addrEscaped}')">🗺️ Ver</button>
        </div>
      `;
    });
    territorioResultados.innerHTML = html;
    
    if (data.length > 0 && data[0].latitude && data[0].longitude) {
      inicializarMapaLeaflet(data[0].latitude, data[0].longitude, data[0].address);
    }
  } catch (error) {
    console.error(error);
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










function crearEdificio() {
  abrirEditorEdificio();
}
// --- ENVIAR NUEVO EDIFICIO O MODIFICACIONES ---

async function guardarEdificio(id = null) {
  const payload = {
    address: document.getElementById("edit_address").value,
    address2: document.getElementById("edit_address2").value,
    name: document.getElementById("edit_name").value,
    territory: document.getElementById("edit_territory").value,
    floors: parseInt(document.getElementById("edit_floors").value) || 0,
    unitsPerFloor: parseInt(document.getElementById("edit_units").value) || 0,
    latitude: parseFloat(document.getElementById("edit_lat").value) || null,
    longitude: parseFloat(document.getElementById("edit_lng").value) || null,
    hasGroundFloor: document.getElementById("edit_pb").checked,
    hasDoorman: document.getElementById("edit_portero").checked,
    description: document.getElementById("edit_description").value
  };

  const url = id ? `/building/${id}` : "/building";
  const method = id ? "PUT" : "POST";

  try {
    const res = await apiFetch(url, {
      method: method,
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    
    if(res.ok) {
      alert("Edificio guardado exitosamente");
      // Si es predi, simula una cancelación para regresar limpio a la vista móvil, sino va al dashboard
      if (currentRole === "predi") {
        cancelarEdificioMovil();
      } else {
        abrirVista("dashboardView");
      }
    } else {
      alert("Error: " + data.message);
    }
  } catch (error) {
    console.error(error);
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
  // Ocultamos la vista del editor y apagamos el contenedor del dashboard
  document.getElementById("editarView").classList.remove("active");
  document.getElementById("mainDashboard").style.display = "none";
    // Volvemos a hacer visible el contenedor original de la app móvil
  document.getElementById("appContainer").style.display = "block";
    // Limpiamos los textos para dejar la app lista para otra búsqueda
  limpiarVista();
  mensajeInicial.style.display = "block";
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
  listaTerritorio.innerHTML = "";
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
