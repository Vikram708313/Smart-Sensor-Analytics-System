param (
    [int]$Port = 8080
)

$baseDir = $PSScriptRoot

# Detect active Local IPv4 Network Addresses
$networkIPs = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | 
    Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notmatch '^169\.' } | 
    Select-Object -ExpandProperty IPAddress)

$endpoint = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, $Port)
$listener = New-Object System.Net.Sockets.TcpListener($endpoint)

try {
    $listener.Start()
    Write-Output "========================================================="
    Write-Output " Smart Sensor Analytics System - Development Web Server"
    Write-Output "========================================================="
    Write-Output " Status:  Listening on 0.0.0.0:$Port (All Interfaces)"
    Write-Output " Local:   http://localhost:$Port/"
    foreach ($ip in $networkIPs) {
        Write-Output " Network: http://${ip}:$Port/"
    }
    Write-Output "========================================================="
} catch {
    Write-Output "Failed to bind to port $Port : $_"
    exit 1
}

while ($listener.Server.IsBound) {
    try {
        $client = $listener.AcceptTcpClient()
        $stream = $client.GetStream()
        $stream.ReadTimeout = 4000
        $stream.WriteTimeout = 4000

        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII)
        $requestLine = $reader.ReadLine()

        if ([string]::IsNullOrWhiteSpace($requestLine)) {
            $client.Close()
            continue
        }

        # Parse HTTP Request line e.g. "GET /index.html HTTP/1.1"
        $parts = $requestLine.Split(' ')
        if ($parts.Length -lt 2) {
            $client.Close()
            continue
        }

        $method = $parts[0]
        $rawPath = $parts[1].Split('?')[0].TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($rawPath) -or $rawPath -eq '/') {
            $rawPath = 'index.html'
        }

        # Decode URL path
        $decodedPath = [System.Uri]::UnescapeDataString($rawPath).Replace('/', '\')
        $filePath = Join-Path $baseDir $decodedPath

        if (-not (Test-Path $filePath -PathType Leaf)) {
            $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $rawPath")
            $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain`r`nContent-Length: $($body.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($body, 0, $body.Length)
            $stream.Flush()
            $client.Close()
            continue
        }

        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $contentType = switch ($ext) {
            '.html' { 'text/html; charset=utf-8' }
            '.css'  { 'text/css; charset=utf-8' }
            '.js'   { 'application/javascript; charset=utf-8' }
            '.json' { 'application/json; charset=utf-8' }
            '.csv'  { 'text/csv; charset=utf-8' }
            '.svg'  { 'image/svg+xml' }
            '.png'  { 'image/png' }
            '.jpg'  { 'image/jpeg' }
            '.jpeg' { 'image/jpeg' }
            '.ico'  { 'image/x-icon' }
            default { 'application/octet-stream' }
        }

        $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
        $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($fileBytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
        $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)

        $stream.Write($headerBytes, 0, $headerBytes.Length)
        $stream.Write($fileBytes, 0, $fileBytes.Length)
        $stream.Flush()
        $client.Close()
    } catch {
        if ($client -ne $null) {
            try { $client.Close() } catch {}
        }
    }
}
