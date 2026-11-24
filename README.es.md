# Persona — la gente vota, el analista decide

Un test de personalidad normal te pide que te describas y luego te vende tu propia
descripción. Persona hace lo contrario.

Las personas que te conocen responden al mismo cuestionario, y sus respuestas se
convierten en tu **Persona**: la versión de ti que de verdad circula por el mundo. Tú
también lo respondes, antes de ver un solo voto, y ese es tu **Ego**, la historia que
cuentas sobre ti mismo. La distancia entre los dos es donde aparece la **Sombra**: la
parte que ninguno de los dos relatos cubre, inferida por un analista y nunca presentada
como un hecho.

Las cuentas las hace C# determinista. El modelo solo narra, así que cada lectura se puede
rastrear hasta los números que la produjeron.

## Cómo arrancarlo

```powershell
.\tools\dev.ps1            # compila y sirve en http://127.0.0.1:8130
.\tools\test.ps1           # 62 pruebas
node tools\e2e.mjs         # 20 comprobaciones en un navegador sin interfaz
```

Necesita .NET 9. Sin npm, sin paso de compilación: el frontend son módulos ES nativos.

## La idea en tres tiempos

- **Persona — el dato.** Lo que dice de ti la sala. Ponderado por cercanía: tu círculo
  íntimo pesa más que un desconocido que llegó por un enlace.
- **Ego — el relato.** Lo que dices de ti. Se responde antes de ver un solo voto, así que
  no se puede ajustar a posteriori.
- **Sombra — el resto.** Donde los dos relatos no se solapan. Siempre planteada como
  hipótesis, nunca como diagnóstico.

## Para seguir leyendo

- [RUN-REPORT.md](RUN-REPORT.md) — lo que se construyó, lo que se verificó y lo que sigue sin probarse.
- [SCALING.md](SCALING.md) — qué falla primero bajo tráfico real y dónde intervenir.
- En inglés: [README.md](README.md) · en francés: [README.fr.md](README.fr.md)
