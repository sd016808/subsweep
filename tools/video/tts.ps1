# Text to speech with the voices built into Windows (WinRT Windows.Media.SpeechSynthesis,
# which also offers the newer "OneCore" voices that System.Speech can't use).
# Reads a JSON list of jobs: [{ "ssml": "<speak …>…</speak>", "out": "C:\\…\\01.wav" }, …]
# and writes one WAV file per job.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/video/tts.ps1 -Jobs jobs.json -Voice Yating
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools/video/tts.ps1 -List
param(
  [string]$Jobs,
  [string]$Voice = 'Yating',
  [switch]$List
)
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
  Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } |
  Select-Object -First 1
function Await($operation, [type]$resultType) {
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.Wait(-1) | Out-Null
  $task.Result
}

$all = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
if ($List) {
  $all | ForEach-Object { '{0} | {1} | {2}' -f $_.DisplayName, $_.Language, $_.Gender }
  exit 0
}

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$match = $all | Where-Object { $_.DisplayName -like "*$Voice*" } | Select-Object -First 1
if (-not $match) { throw "Voice not found: $Voice (use -List)" }
$synth.Voice = $match

# (Windows PowerShell 5.1 returns a JSON array as one object; foreach still walks it.)
$jobList = Get-Content -Raw -Encoding UTF8 $Jobs | ConvertFrom-Json
foreach ($job in $jobList) {
  try {
    $stream = Await ($synth.SynthesizeSsmlToStreamAsync($job.ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  } catch {
    $inner = $_.Exception
    while ($inner.InnerException) { $inner = $inner.InnerException }
    throw "Speech synthesis failed: $($inner.Message)`n$($job.ssml)"
  }
  $size = [uint32]$stream.Size
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $null = Await ($reader.LoadAsync($size)) ([uint32])
  $bytes = New-Object byte[] $size
  $reader.ReadBytes($bytes)
  [System.IO.File]::WriteAllBytes($job.out, $bytes)
  $reader.Dispose()
  $stream.Dispose()
}
"ok $($jobList.Count)"
