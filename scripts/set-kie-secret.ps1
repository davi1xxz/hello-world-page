$ErrorActionPreference = "Stop"

$secure = Read-Host "Cole a KIE_API_KEY" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
)

try {
  npx.cmd supabase secrets set "KIE_API_KEY=$plain"
}
finally {
  $plain = $null
}
