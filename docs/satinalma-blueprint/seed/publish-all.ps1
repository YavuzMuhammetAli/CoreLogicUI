<#
.SYNOPSIS
    CoreLogic Procurement blueprint - tenant kurulumu ve 50 modelin yayinlanmasi.

.DESCRIPTION
    docs/satinalma-blueprint tasarimini canli bir CoreLogic tenant'ina uygular ve
    publish performans olcumlerini toplar (test T-47..T-50).

    ADIMLAR
      1. Tenant provision (POST /Auth/register-company) -> admin JWT
      2. models.json'daki modelleri DALGA sirasiyla yayinla
      3. Ikinci gecis: dongusel lookup (Department.ManagerEmployeeId)
      4. workflows.json -> workflow tanimlari (roleId'ler calisma aninda cozulur)
      5. publish-metrics.csv uret

.PARAMETER DepthProbeOnly
    T-05 dogrulamasi: 7 modellik lookup zinciri kurar ve derinlik sinirina
    takilip takilmadigini raporlar. 50 model yayinlamadan ONCE calistirilmalidir.

.NOTES
    API SOZLESMESI 2026-09-22'de Swagger'dan DOGRULANDI:

      POST /Published/addTable?parentTableName={ad}
           body: PublishedTable  -> { tableName, description, parentTableId }
           DIKKAT: alan adi 'tableName', 'name' DEGIL.

      POST /Published/addMember?typeName=&memberName=&memberType=&isRequired=...
           BODY YOK - her sey QUERY PARAMETRESI.
           DIKKAT: model NUMERIK ID ile degil, 'typeName' (model adi) ile gosterilir.
           DIKKAT: tip alani 'memberType', 'dataType' DEGIL.

      POST /Published/publish?typeName={ad}          (body yok)
      POST /Workflow/define                          body: WorkflowDefinitionDto
           definitionJson ve triggerConditionJson STRING olarak gonderilir.

    PowerShell 5.1 uyumlu (&&, ternary, ?? kullanilmaz).
#>

[CmdletBinding()]
param(
    [string] $BaseUrl      = "https://localhost:7254",
    [string] $TenantCode   = "satinalma",
    [string] $CompanyName  = "Ornek Teknoloji A.S.",
    [string] $AdminEmail   = "admin@satinalma.local",
    [string] $AdminPass    = "Sat!nAlma1234",
    [string] $Jwt          = "",
    [switch] $SkipProvision,
    [switch] $DepthProbeOnly,
    [switch] $SkipWorkflows,
    [switch] $WorkflowsOnly,
    [int]    $FromWave = 1,
    [string] $ApiProcessName = "WebAPI"
)

$ErrorActionPreference = "Stop"
$script:SeedDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:Metrics    = New-Object System.Collections.ArrayList
$script:Jwt        = $Jwt
$script:RateRetry  = 0

try {
    Add-Type -TypeDefinition @'
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class CoreLogicCertPolicy : ICertificatePolicy {
    public bool CheckValidationResult(ServicePoint sp, X509Certificate cert, WebRequest req, int problem) { return true; }
}
'@ -ErrorAction SilentlyContinue
    [System.Net.ServicePointManager]::CertificatePolicy = New-Object CoreLogicCertPolicy
} catch { }
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

# ---------------------------------------------------------------- yardimcilar

function Write-Step([string] $m) { Write-Host ""; Write-Host ">> $m" -ForegroundColor Cyan }
function Write-Ok([string] $m)   { Write-Host "   OK   $m" -ForegroundColor Green }
function Write-Warn2([string] $m){ Write-Host "   WARN $m" -ForegroundColor Yellow }
function Write-Err([string] $m)  { Write-Host "   FAIL $m" -ForegroundColor Red }

function Invoke-Api {
    param([string] $Method, [string] $Path, $Body = $null, [switch] $Anonymous)
    $headers = @{ "Content-Type" = "application/json" }
    if (-not $Anonymous -and $script:Jwt) { $headers["Authorization"] = "Bearer $($script:Jwt)" }
    $uri = "$BaseUrl$Path"
    try {
        if ($null -ne $Body) {
            $json = $Body | ConvertTo-Json -Depth 30 -Compress
            return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -Body $json
        }
        return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
    }
    catch [System.Net.WebException] {
        # PS 5.1'de 'catch ... when' YOKTUR (C# sozdizimi) - ayrim burada yapilir.
        $code = 0
        if ($_.Exception.Response) { $code = [int] $_.Exception.Response.StatusCode }

        # Platform IP basina 300 istek/dk sinirliyor (SecurityExtensions.cs:99-101).
        # Bu kurulum ~590 istek gerektiriyor -> sinira carpmak KACINILMAZ.
        if ($code -eq 429 -and $script:RateRetry -lt 12) {
            $wait = 20
            try {
                $ra = $_.Exception.Response.Headers["Retry-After"]
                if ($ra) { $wait = [int] $ra }
            } catch { }
            $script:RateRetry++
            Write-Warn2 "HTTP 429 - hiz siniri. $wait sn bekleniyor (deneme $($script:RateRetry)/12)..."
            Start-Sleep -Seconds $wait
            $script:RateRetry--
            return Invoke-Api -Method $Method -Path $Path -Body $Body -Anonymous:$Anonymous
        }

        # Invoke-RestMethod hata yanitinin GOVDESINI yutar - acikca okumak sart,
        # yoksa "400 Hatali Istek" disinda hicbir bilgi kalmaz.
        $detail = ""
        try {
            $resp = $_.Exception.Response
            if ($resp) {
                $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
                $detail = $sr.ReadToEnd()
                $sr.Close()
            }
        } catch { }
        $status = ""
        if ($_.Exception.Response) { $status = [int] $_.Exception.Response.StatusCode }
        throw "HTTP $status $Method $Path :: $detail"
    }
}

function Get-ApiMemoryMb {
    try {
        $p = Get-Process -Name $ApiProcessName -ErrorAction Stop | Select-Object -First 1
        return [math]::Round($p.WorkingSet64 / 1MB, 1)
    } catch { return $null }
}

function Add-Q {
    param([string] $Query, [string] $Key, $Value)
    if ($null -eq $Value) { return $Query }
    if ($Value -is [string] -and $Value -eq "") { return $Query }
    $v = $Value
    if ($v -is [bool]) { if ($v) { $v = "true" } else { $v = "false" } }
    $enc = [System.Uri]::EscapeDataString([string] $v)
    if ($Query) { return "$Query&$Key=$enc" }
    return "?$Key=$enc"
}

# ---------------------------------- API sozlesmesi (Swagger'dan DOGRULANDI)

function New-Table {
    param([string] $Name, [string] $ParentName, [string] $Description)
    $q = ""
    if ($ParentName) { $q = Add-Q -Query $q -Key "parentTableName" -Value $ParentName }
    $body = @{ tableName = $Name }
    if ($Description) { $body["description"] = $Description }
    return Invoke-Api -Method POST -Path "/Published/addTable$q" -Body $body
}

function New-Member {
    param([string] $TypeName, $Col)
    $q = ""
    $q = Add-Q -Query $q -Key "typeName"   -Value $TypeName
    $q = Add-Q -Query $q -Key "memberName" -Value $Col.n
    $q = Add-Q -Query $q -Key "memberType" -Value $Col.t

    $req = $false
    if ($Col.PSObject.Properties.Name -contains "r" -and $Col.r) { $req = $true }
    $q = Add-Q -Query $q -Key "isRequired" -Value $req

    $map = @{
        "minLen" = "minLength"; "maxLen" = "maxLength"
        "min"    = "min";       "max"    = "max"
        "rx"     = "regex";     "rxMsg"  = "regexMessage"
        "enum"   = "enumValues"
        "lk"     = "lookupTargetTable"; "lkd" = "lookupDisplayColumn"
        "lbl"    = "label"
    }
    foreach ($k in $map.Keys) {
        if ($Col.PSObject.Properties.Name -contains $k) {
            $q = Add-Q -Query $q -Key $map[$k] -Value $Col.$k
        }
    }
    return Invoke-Api -Method POST -Path "/Published/addMember$q"
}

function Publish-Model {
    param([string] $TypeName)
    $q = Add-Q -Query "" -Key "typeName" -Value $TypeName
    return Invoke-Api -Method POST -Path "/Published/publish$q"
}

<#
 Tablo + TUM kolonlari TEK istekte olusturur (G-14 duzeltmesi).
 Eski yol: 1 x addTable + N x addMember = N+1 istek. 520 kolonluk kurulum
 ~595 istek ediyordu ve 300/dk hiz sinirina carpiyordu.
 Yeni yol: model basina 1 istek -> ~50 istek.
#>
function New-TableWithMembers {
    param([string] $Name, [string] $ParentName, [string] $Description, $Cols)

    $members = @()
    foreach ($c in $Cols) {
        $m = @{
            name       = $c.n
            dataType   = $c.t
            isRequired = ($c.PSObject.Properties.Name -contains "r" -and $c.r)
        }
        $map = @{
            "lbl" = "label"; "lk" = "lookupTargetTable"; "lkd" = "lookupDisplayColumn"
            "enum" = "enumValues"; "rx" = "regex"; "rxMsg" = "regexMessage"
            "min" = "min"; "max" = "max"; "minLen" = "minLength"; "maxLen" = "maxLength"
        }
        foreach ($k in $map.Keys) {
            if ($c.PSObject.Properties.Name -contains $k) { $m[$map[$k]] = $c.$k }
        }
        $members += $m
    }

    $body = @{
        table   = @{ tableName = $Name; description = $Description }
        members = $members
    }
    if ($ParentName) { $body["parentTableName"] = $ParentName }

    return Invoke-Api -Method POST -Path "/Published/addTableWithMembers" -Body $body
}

# -------------------------------------------------------------- provisioning

function New-Tenant {
    Write-Step "Tenant provision: $TenantCode"
    $body = @{
        companyName  = $CompanyName
        companyCode  = $TenantCode
        adminName    = "Sistem"
        adminSurname = "Yonetici"
        email        = $AdminEmail
        password     = $AdminPass
    }
    $resp = Invoke-Api -Method POST -Path "/Auth/register-company" -Body $body -Anonymous
    if (-not $resp.success) { throw "register-company basarisiz: $($resp.message)" }

    $provisionId = $resp.data.provisionId
    if (-not $provisionId) { $provisionId = $resp.data }
    Write-Ok "provisionId = $provisionId"

    $deadline = (Get-Date).AddMinutes(10)
    while ((Get-Date) -lt $deadline) {
        $st = Invoke-Api -Method GET -Path "/Auth/provision-status/$provisionId" -Anonymous
        # DIKKAT: token IC ICE -> data.token.token (data.token bir NESNE, string degil)
        $tok = $st.data.token.token
        if ($tok) {
            $script:Jwt = $tok
            Write-Ok "Provisioning tamamlandi, JWT alindi (son gecerlilik: $($st.data.token.expiration))."
            return
        }
        if ($st.data.status -eq "Failed") { throw "Provisioning basarisiz: $($st.data.error) $($st.message)" }
        Write-Host "   ... $($st.data.status)" -ForegroundColor DarkGray
        Start-Sleep -Seconds 3
    }
    throw "Provisioning 10 dakikada tamamlanmadi."
}

# ------------------------------------------------------------ model yayinlama

function Publish-Wave {
    param([int] $Wave, $Models, [System.Collections.Generic.HashSet[string]] $Published)

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $memBefore = Get-ApiMemoryMb
    $colCount = 0

    foreach ($m in $Models) {
        # Kendi kendine referans veren lookup icin model KENDI adini once kaydetmeli.
        [void] $Published.Add($m.name)

        foreach ($c in $m.cols) {
            if ($c.PSObject.Properties.Name -contains "lk") {
                if (-not $Published.Contains($c.lk)) {
                    throw "$($m.name).$($c.n) -> lookup hedefi '$($c.lk)' henuz yayinlanmamis (dalga $Wave)."
                }
            }
        }

        # TEK istek: tablo + tum kolonlar. Sunucu "ya hepsi ya hicbiri" semantigiyle yazar
        # ve parti ici duplicate kolonlari da yakalar.
        $t = New-TableWithMembers -Name $m.name -ParentName $m.parent -Description $m.label -Cols $m.cols
        if (-not $t.success) {
            $detail = ""
            if ($t.data -and $t.data.errors) {
                $detail = ($t.data.errors.PSObject.Properties | ForEach-Object { "$($_.Name): $($_.Value)" }) -join " | "
            }
            throw "addTableWithMembers '$($m.name)': $($t.message) $detail"
        }
        $colCount += $m.cols.Count
    }

    # Publish AGAC kapsamlidir: alt model kok ile birlikte gider. Bu yuzden bu dalgadaki
    # her modelin KOK ATASI yayinlanmali - alt model onceki bir dalgada yayinlanmis bir
    # koke eklendiyse, o kok YENIDEN yayinlanmak zorunda.
    $roots = New-Object 'System.Collections.Generic.List[string]'
    foreach ($m in $Models) {
        $cur = $m
        while ($cur.parent) {
            $next = $script:AllModels | Where-Object { $_.name -eq $cur.parent } | Select-Object -First 1
            if (-not $next) { break }
            $cur = $next
        }
        if (-not $roots.Contains($cur.name)) { [void] $roots.Add($cur.name) }
    }
    foreach ($rootName in $roots) {
        $p = Publish-Model -TypeName $rootName
        if (-not $p.success) { throw "publish '$rootName': $($p.message)" }
    }

    $sw.Stop()
    $memAfter = Get-ApiMemoryMb
    $delta = $null
    if ($null -ne $memBefore -and $null -ne $memAfter) { $delta = [math]::Round($memAfter - $memBefore, 1) }

    $row = [PSCustomObject]@{
        Wave = $Wave; Models = $Models.Count; Roots = $roots.Count; Columns = $colCount
        Seconds = [math]::Round($sw.Elapsed.TotalSeconds, 2)
        MemBeforeMb = $memBefore; MemAfterMb = $memAfter; MemDeltaMb = $delta
    }
    [void] $script:Metrics.Add($row)
    Write-Ok ("Dalga {0}: {1} model / {2} kolon / {3} sn / bellek {4} MB" -f $Wave, $Models.Count, $colCount, $row.Seconds, $memAfter)
}

function Publish-AllModels {
    Write-Step "models.json yukleniyor"
    $doc = Get-Content -Path (Join-Path $script:SeedDir "models.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    $script:AllModels = $doc.models
    Write-Ok "$($doc.models.Count) model okundu"

    $published = New-Object 'System.Collections.Generic.HashSet[string]'
    if ($FromWave -gt 1) {
        # Devam modu: tenant'ta zaten var olan modelleri yuklu say.
        $existing = Invoke-Api -Method GET -Path "/Published/getAll"
        foreach ($e in $existing.data) { [void] $published.Add($e.tableName) }
        Write-Warn2 "Devam modu: dalga $FromWave'den itibaren. Mevcut $($published.Count) model yuklu sayildi."
    }
    $waves = $doc.models | Group-Object -Property wave | Sort-Object { [int] $_.Name }

    foreach ($w in $waves) {
        $waveNo = [int] $w.Name
        if ($waveNo -lt $FromWave) { continue }
        if ($waveNo -eq 18) {
            Write-Warn2 "Dalga 18 (CompanyVehicle) ATLANDI - runtime testi olarak ELLE olusturulmali (T-09)."
            continue
        }
        Publish-Wave -Wave $waveNo -Models $w.Group -Published $published
    }
    return $published
}

# ----------------------------------------- ikinci gecis: dongusel lookup

function Invoke-SecondPass {
    Write-Step "Ikinci gecis: dongusel lookup (bulgu B-01)"
    Write-Warn2 "Lookup hedefi kayitli bir PublishedTable olmak zorunda; Department <-> Employee"
    Write-Warn2 "dongusu tek gecise sigmiyor."

    # IDEMPOTANS (H-4): kolon zaten varsa TEKRAR EKLEME - ikinci kez eklenirse
    # publish CS0102 ile kirilir ve Department kalici olarak yayinlanamaz hale gelir.
    $schema = Invoke-Api -Method GET -Path ("/Published/getTable" + (Add-Q -Query "" -Key "typeName" -Value "Department"))
    $has = $false
    if ($schema.success -and $schema.data.columns) {
        foreach ($ec in $schema.data.columns) { if ($ec.name -eq "ManagerEmployeeId") { $has = $true } }
    }
    if ($has) {
        Write-Ok "Department.ManagerEmployeeId zaten var - atlandi."
        return
    }

    $col = [PSCustomObject]@{ n = "ManagerEmployeeId"; t = "lookup"; lbl = "Yonetici"; lk = "Employee"; lkd = "FullName" }
    $r = New-Member -TypeName "Department" -Col $col
    if (-not $r.success) { throw "addMember Department.ManagerEmployeeId: $($r.message)" }

    $p = Publish-Model -TypeName "Department"
    if (-not $p.success) { throw "publish Department: $($p.message)" }
    Write-Ok "Department.ManagerEmployeeId eklendi - dongusel lookup kuruldu (T-07)."
}

# --------------------------------------------------- T-05 derinlik sondaji

function Invoke-DepthProbe {
    Write-Step "T-05 - lookup zinciri derinlik sondaji (7 model)"
    Write-Host "   Amac: lookup kenarlari MaxDepthRule'a TAKILMIYOR mu?" -ForegroundColor DarkGray
    Write-Host "   Kaynak: CircularDependencyRule.cs:14-15, MaxDepthRule.cs:25-38" -ForegroundColor DarkGray

    $stamp = (Get-Date).ToString("HHmmss")
    $chain = @("PrbA$stamp","PrbB$stamp","PrbC$stamp","PrbD$stamp","PrbE$stamp","PrbF$stamp","PrbG$stamp")
    $previous = $null

    for ($i = 0; $i -lt $chain.Count; $i++) {
        $name = $chain[$i]
        try {
            $t = New-Table -Name $name -ParentName $null -Description "T-05 sonda"
            if (-not $t.success) { throw "addTable: $($t.message)" }

            $r1 = New-Member -TypeName $name -Col ([PSCustomObject]@{ n = "Title"; t = "string"; r = $true; lbl = "Baslik" })
            if (-not $r1.success) { throw "addMember Title: $($r1.message)" }

            if ($previous) {
                $lk = [PSCustomObject]@{ n = "RefId"; t = "lookup"; lbl = "Ref"; lk = $previous; lkd = "Title" }
                $r2 = New-Member -TypeName $name -Col $lk
                if (-not $r2.success) { throw "addMember RefId -> $previous : $($r2.message)" }
            }

            $p = Publish-Model -TypeName $name
            if (-not $p.success) { throw "publish: $($p.message)" }

            Write-Ok "Seviye $($i + 1): $name yayinlandi"
            $previous = $name
        }
        catch {
            $msg = "$_"
            Write-Err "Seviye $($i + 1) ($name) BASARISIZ: $msg"
            Write-Host ""
            # Her hata derinlik hatasi DEGILDIR - ayirt et, yoksa yanlis sonuc raporlanir.
            if ($msg -match "401|403|Onaylanmad|Unauthorized|Forbidden") {
                Write-Host "   >>> T-05 SONUCSUZ: kimlik dogrulama hatasi (derinlik testi KOSMADI)." -ForegroundColor Yellow
            }
            elseif ($msg -match "[Dd]erinlik|[Dd]epth|MaxDepth") {
                Write-Host "   >>> T-05 SONUCU: FAIL - lookup zinciri derinlik sinirina TAKILIYOR." -ForegroundColor Red
                Write-Host "   >>> Tasarimin omurgasi (05-entity-iliskileri.md K1) GECERSIZ." -ForegroundColor Red
            }
            else {
                Write-Host "   >>> T-05 SONUCSUZ: beklenmeyen hata - yukaridaki mesaji inceleyin." -ForegroundColor Yellow
            }
            return $false
        }
    }
    Write-Host ""
    Write-Host "   >>> T-05 SONUCU: PASS - 7 seviyelik lookup zinciri kuruldu." -ForegroundColor Green
    Write-Host "   >>> Tasarimin omurgasi (K1) dogrulandi." -ForegroundColor Green
    return $true
}

# ------------------------------------------------------------------ workflow

function Publish-Workflows {
    Write-Step "workflows.json - rol ID'leri cozuluyor"

    $roleResp = Invoke-Api -Method GET -Path "/Role/getall"
    $roleMap = @{}
    foreach ($r in $roleResp.data) { $roleMap[$r.name] = $r.id }
    Write-Ok ("Tenant rolleri: " + (($roleMap.Keys) -join ", "))

    $codeToName = @{ "2" = "purchasing-manager"; "4" = "finance-manager"; "6" = "department-manager"; "9" = "management" }
    $raw = Get-Content -Path (Join-Path $script:SeedDir "workflows.json") -Raw -Encoding UTF8

    foreach ($ph in $codeToName.Keys) {
        $rn = $codeToName[$ph]
        if (-not $roleMap.ContainsKey($rn)) { Write-Warn2 "Rol yok: $rn (placeholder $ph degistirilmedi)"; continue }
        $raw = $raw -replace "`"roleId`": $ph\b", "`"roleId`": $($roleMap[$rn])"
        Write-Ok "$rn -> roleId $($roleMap[$rn])"
    }

    $doc = $raw | ConvertFrom-Json
    foreach ($wf in $doc.workflows) {
        $body = @{
            name                 = $wf.name
            code                 = $wf.code
            modelName            = $wf.modelName
            triggerEvent         = $wf.triggerEvent
            isEnabled            = $wf.isEnabled
            triggerConditionJson = ($wf.triggerConditionJson | ConvertTo-Json -Depth 10 -Compress)
            definitionJson       = ($wf.definitionJson       | ConvertTo-Json -Depth 20 -Compress)
        }
        $d = Invoke-Api -Method POST -Path "/Workflow/define" -Body $body
        if (-not $d.success) { Write-Err "define $($wf.code): $($d.message)"; continue }

        $wfId = $d.data.id
        if (-not $wfId) { $wfId = $d.data }
        $p = Invoke-Api -Method POST -Path "/Workflow/publish?id=$wfId"
        if ($p.success) { Write-Ok "$($wf.code) yayinlandi (id $wfId)" }
        else            { Write-Err "publish $($wf.code): $($p.message)" }
    }
}

# ---------------------------------------------------------------------- main

Write-Host ""
Write-Host "=== CoreLogic Procurement - seed ===" -ForegroundColor White
Write-Host "    BaseUrl    : $BaseUrl"
Write-Host "    TenantCode : $TenantCode"

if ($DepthProbeOnly) {
    if (-not $script:Jwt -and -not $SkipProvision) { New-Tenant }
    if (-not $script:Jwt) { throw "JWT yok." }
    $ok = Invoke-DepthProbe
    if ($ok) { exit 0 }
    exit 1
}

if (-not $SkipProvision -and -not $script:Jwt) { New-Tenant }
if (-not $script:Jwt) { throw "JWT yok. -Jwt verin veya -SkipProvision kaldirin." }

if ($WorkflowsOnly) {
    Publish-Workflows
    exit 0
}

[void] (Publish-AllModels)
Invoke-SecondPass

Write-Step "Iliskiler (relationships.json)"
Write-Warn2 "POST /publish/models/{id}/relationships model ID'si ister."
Write-Warn2 "LegacyFkConflictRule catismasi BEKLENIYOR (R2/R3/R4/R5)."
Write-Warn2 "Bu adim T-06 sonucuna gore ELLE yurutulmeli - bkz. relationships.json"

if (-not $SkipWorkflows) { Publish-Workflows }

# ------------------------------------------------------------------ olcumler

$csvPath = Join-Path $script:SeedDir "publish-metrics.csv"
$script:Metrics | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8
Write-Step "Olcumler: $csvPath"
$script:Metrics | Format-Table -AutoSize

$totalSec = ($script:Metrics | Measure-Object -Property Seconds -Sum).Sum
$totalCol = ($script:Metrics | Measure-Object -Property Columns -Sum).Sum
Write-Host ""
Write-Host "Toplam: $($script:Metrics.Count) dalga / $totalCol kolon / $([math]::Round($totalSec,1)) sn" -ForegroundColor White
Write-Host ""
Write-Host "SONRAKI ADIMLAR:" -ForegroundColor White
Write-Host "  1. CompanyVehicle'i /build/new ekranindan ELLE olusturun (T-09, dalga 18)"
Write-Host "  2. roles.json izinlerini /roles ekranindan uygulayin"
Write-Host "  3. Demo senaryosu: 16-demo-senaryosu.md"
Write-Host "  4. T-01..T-54 sonuclari: 20-canli-dogrulama-sonuclari.md"
Write-Host ""
