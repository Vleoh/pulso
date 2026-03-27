# Pulso Pais - Home + Backoffice + API + IA editorial

Arquitectura:

- `frontend/`: Next.js (portada premium + mobile, pensado para Vercel).
- `backend/`: Express + Prisma + PostgreSQL (API publica + backoffice editorial).
- `docker-compose.yml`: stack local (`postgres` + `backend` + `frontend`) conectando a Ollama del host (fallback).
- `render.yaml`: base para desplegar backend y DB en Render.

## Funcionalidades implementadas

- Home editorial redisenada con identidad negro/blanco/dorado.
- Jerarquia de portada: hero dominante + secundarias + modulos editoriales.
- Secciones clave: Radar Electoral, Pulso Federal, Opinion, Entrevistas, Publinotas.
- Noticias reales por APIs abiertas:
  - GDELT DOC API
  - Google News RSS (Argentina/politica)
- Backoffice web para crear, editar, borrar, publicar y destacar noticias.
- Selector de tema visual del home en backoffice:
  - `Pulso Premium (actual)`
  - `Clasico Editorial (referencia pulso-pais.html)`
  - `Social Newsroom (cards + interaccion)`
- Tema `social` orientado a consumo constante:
  - Feed de tarjetas consumibles.
  - Reacciones locales (`Apoyo`, `Analisis`, `Guardar`, `Compartir`) de bajo costo.
  - Gadgets de seguimiento y bloques de comunidad.
- Backoffice con Asistente IA visible en el formulario:
  - `Generar borrador IA` (titulo, volanta, bajada, cuerpo, tags, seccion y distrito sugeridos).
  - `Evaluar borrador actual` (decision ALLOW/REVIEW/REJECT previa al guardado).
  - `Aplicar sugerencias` antes de publicar.
- Wrapper de datos para IA:
  - La IA recibe contexto de agenda desde un wrapper que combina noticias internas (base de datos) y externas (GDELT + RSS).
  - El estado del wrapper (cantidad de notas internas/externas) se muestra en el formulario del asistente.
- Backoffice mejorado:
  - Layout con sidebar.
  - Modos `Default`, `Focus` y `Compact`.
  - Filtro rapido de tabla por texto, estado y decision IA.
- Filtro editorial transversal con IA (Gemini primario + Ollama fallback):
  - Toda alta/edicion pasa por IA.
  - Resultado `ALLOW`, `REVIEW` o `REJECT`.
  - `REJECT`: bloquea publicacion.
  - `REVIEW`: si venia `PUBLISHED`, baja automaticamente a `DRAFT`.
  - Usa lineamientos de `pulso-pais-linea-editorial` (archivo cargado en `backend/editorial/pulso-pais-linea-editorial.txt`).

## Endpoints principales

- `GET /health`
- `GET /api/home`
- `GET /api/news`
- `POST /api/admin/login`
- `GET /api/admin/ai/context`
- `POST /api/admin/ai/assist`
- `POST /api/admin/ai/review`
- `GET /api/admin/settings/theme`
- `POST /api/admin/settings/theme`
- Backoffice web: `/backoffice`

## Setup local sin Docker

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npx prisma migrate deploy
npm run seed
npm run dev
```

Backend:

- API: `http://localhost:8080`
- Backoffice: `http://localhost:8080/backoffice`

Credenciales por defecto:

- email: `admin@pulsopais.local`
- password: `cambiar-este-password`

### Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Frontend:

- `http://localhost:3000`

## Setup local con Docker (Gemini primario + Ollama local fallback)

```bash
docker compose up --build
```

Asegurate de tener Ollama corriendo en tu maquina host y al menos un modelo `qwen3*`:

```bash
ollama list
```

Si no tenes uno, descarga por unica vez en tu host (no en Docker):

```bash
ollama pull qwen3
```

Tip: en produccion conviene usar `GEMINI_API_KEY` + `GEMINI_MODEL`. Si Gemini falla o no responde, el backend cae a Ollama automaticamente segun `AI_PROVIDER_ORDER`.

Servicios:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8080`
- Backoffice: `http://localhost:8080/backoffice`
- Ollama host esperado: `http://localhost:11434`

## Variables de entorno backend

Base:

- `DATABASE_URL`
- `CORS_ORIGINS`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_JWT_SECRET`
- `ADMIN_COOKIE_NAME`

IA editorial:

- `AI_FILTER_ENABLED=true|false`
- `AI_FILTER_ENFORCE=true|false`
- `AI_PROVIDER_ORDER=gemini,ollama`
- `GEMINI_API_KEY=...`
- `GEMINI_MODEL=gemini-2.0-flash`
- `AI_OLLAMA_URL=http://localhost:11434`
- `AI_MODEL=qwen3`
- `AI_TIMEOUT_MS=20000`
- `EDITORIAL_GUIDELINES_PATH=./editorial/pulso-pais-linea-editorial.txt`

## Deploy backend en Render

1. Crear DB `pulso-postgres`.
2. Crear servicio `pulso-backend` usando `render.yaml`.
3. Configurar secrets:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `ADMIN_JWT_SECRET`
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL`
   - `AI_PROVIDER_ORDER=gemini,ollama`
   - `AI_OLLAMA_URL` (opcional para fallback, solo si tenes un endpoint Ollama accesible)
4. Ajustar `CORS_ORIGINS` con dominio final del frontend.

## Deploy frontend en Vercel

Proyecto apuntando a carpeta `frontend/` (recomendado separado del backend).

Variables:

- `NEXT_PUBLIC_API_URL=https://tu-backend.onrender.com`
- `API_INTERNAL_URL=https://tu-backend.onrender.com`
- `NEXT_PUBLIC_BACKOFFICE_URL=https://tu-backend.onrender.com/backoffice`
