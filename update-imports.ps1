$files = Get-ChildItem -Path "src" -Recurse -Include "*.ts", "*.tsx"
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    $updatedContent = $content -replace "from '\.\.\/lib\/supabase'", "from '../lib/supabaseClient'" `
                              -replace "from '\.\./\.\./lib\/supabase'", "from '../../lib/supabaseClient'"
    if ($content -ne $updatedContent) {
        Set-Content -Path $file.FullName -Value $updatedContent
        Write-Host "Updated $($file.Name)"
    }
} 