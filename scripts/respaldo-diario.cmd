@echo off
REM Respaldo diario de Cierre Caja Express.
REM Lo invoca el Programador de tareas de Windows. Ver docs/ARQUITECTURA.md.
REM El codigo de salida distinto de cero hace que la tarea aparezca fallida.

cd /d "%~dp0.."
call npm run db:respaldar
exit /b %errorlevel%
