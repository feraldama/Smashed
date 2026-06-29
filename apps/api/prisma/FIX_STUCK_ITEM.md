# 🔧 Solución: Item Pegado en el Mostrador

Si un item (como "Agua con Gas") se quedó pegado en el mostrador y no puedes quitarlo, aquí hay varias soluciones:

## ✅ Opción 1: A través de la Interfaz (Recomendado primero)

1. Abre la pantalla **KDS → MOSTRADOR**
2. Busca el pedido #90 con el "Agua con Gas"
3. El item debería tener un botón **"✓ Listo"** en la esquina inferior derecha
4. Si ves el botón:
   - Haz clic en **"✓ Listo"** para marcar la bebida como lista
   - Luego presiona **"Entregar al cliente"** para finalizar el pedido

Si no ves los botones o están deshabilitados, usa la Opción 2.

---

## 🛠️ Opción 2: Script Interactivo (Más Seguro)

Este script te muestra exactamente qué va a pasar antes de hacerlo:

```bash
# Desde la carpeta apps/api
npx ts-node prisma/inspect-pedido.ts 90
```

Luego selecciona una opción:

- **1**: Marcar el item como LISTO (recomendado)
- **2**: Cancelar el item permanentemente
- **3**: Salir sin cambios

---

## ⚡ Opción 3: Script Automático

Si prefieres una ejecución directa (sin confirmaciones):

```bash
# Desde la carpeta apps/api
npx ts-node prisma/fix-stuck-item.ts 90 "Agua con Gas"
```

Esto:

1. Busca el pedido #90
2. Encuentra el item "Agua con Gas"
3. Lo marca como LISTO automáticamente

---

## 🐛 Diagnóstico Rápido

Antes de ejecutar cualquier script, verifica el estado del pedido:

```bash
# Abre la consola dentro de Node.js en la carpeta apps/api:
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const pedido = await prisma.pedido.findFirst({
    where: { numero: 90 },
    include: { items: { include: { productoVenta: true } } },
  });
  console.log(JSON.stringify(pedido, null, 2));
  process.exit(0);
})();
"
```

---

## 📋 Pasos Completos

### 1️⃣ Abre Terminal en VS Code

- Presiona `Ctrl + '` para abrir terminal
- Navega a `apps/api`: `cd apps/api`

### 2️⃣ Ejecuta el Script Interactivo

```bash
pnpm exec ts-node prisma/inspect-pedido.ts 90
```

### 3️⃣ Sigue las Instrucciones

- Lee la información del pedido
- Elige la acción (1, 2 o 3)
- Confirma si es necesario

### 4️⃣ Verifica en el KDS

- Recarga la pantalla del Mostrador
- El item debería haber desaparecido o estar en estado LISTO

---

## ⚠️ Notas Importantes

- **LISTO**: El item se marca como completado pero sigue en el pedido.
- **CANCELADO**: El item se elimina del cálculo y no aparecerá en entregas.
- Si el pedido ya fue **FACTURADO**, no se puede modificar.
- Los cambios se sincronizarán automáticamente a través del websocket.

---

## 🆘 Si Nada Funciona

Si los scripts fallan o hay un error, puede ser porque:

1. **Problema de conexión a BD**: Verifica que PostgreSQL está corriendo
2. **Credenciales de BD**: Revisa `.env` en `apps/api`
3. **Versión de Node**: Usa Node 18+ (`node --version`)

Para más detalles, consulta el [README principal](../../README.md).
