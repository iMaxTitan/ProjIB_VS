@echo off
setlocal

:: Define base path relative to the script location
set BASE_PATH=%~dp0src

echo Reorganizing project structure...

:: Move utils to lib/utils
echo Moving utils to lib...
if exist "%BASE_PATH%\utils" (
    if not exist "%BASE_PATH%\lib\utils" mkdir "%BASE_PATH%\lib\utils"
    xcopy "%BASE_PATH%\utils" "%BASE_PATH%\lib\utils\" /E /I /Y /Q /H /R
    if %errorlevel% equ 0 (
        rmdir /S /Q "%BASE_PATH%\utils"
        echo   Utils moved successfully.
    ) else (
        echo   Error moving utils. Please check manually.
    )
) else (
    echo   Utils directory not found. Skipping.
)

:: Move contexts to context
echo Moving contexts to context...
if exist "%BASE_PATH%\contexts" (
    if not exist "%BASE_PATH%\context" mkdir "%BASE_PATH%\context"
    xcopy "%BASE_PATH%\contexts" "%BASE_PATH%\context\" /E /I /Y /Q /H /R
    if %errorlevel% equ 0 (
        rmdir /S /Q "%BASE_PATH%\contexts"
        echo   Contexts moved successfully.
    ) else (
        echo   Error moving contexts. Please check manually.
    )
) else (
    echo   Contexts directory not found. Skipping.
)

:: Move config to lib/config
echo Moving config to lib/config...
if exist "%BASE_PATH%\config" (
    if not exist "%BASE_PATH%\lib\config" mkdir "%BASE_PATH%\lib\config"
    xcopy "%BASE_PATH%\config" "%BASE_PATH%\lib\config\" /E /I /Y /Q /H /R
    if %errorlevel% equ 0 (
        rmdir /S /Q "%BASE_PATH%\config"
        echo   Config moved successfully.
    ) else (
        echo   Error moving config. Please check manually.
    )
) else (
    echo   Config directory not found. Skipping.
)

:: Delete src/index.js
echo Deleting src/index.js...
if exist "%BASE_PATH%\index.js" (
    del /F /Q "%BASE_PATH%\index.js"
    echo   src/index.js deleted.
) else (
    echo   src/index.js not found. Skipping.
)

:: Delete src/pages directory
echo Deleting src/pages directory...
if exist "%BASE_PATH%\pages" (
    rmdir /S /Q "%BASE_PATH%\pages"
    echo   src/pages directory deleted.
) else (
    echo   src/pages directory not found. Skipping.
)

echo ---------------------------------
echo Project reorganization complete.
echo Please check for any import errors and update paths if necessary.
echo ---------------------------------

endlocal
pause
