# ST-095 — local phrase synthesis for the demonstration proof.
#
# Reads a JSON job file of { outPath, text } entries and renders each phrase to
# its own 48 kHz 16-bit mono WAV using the Windows Speech API, which ships with
# the operating system. No network call is made and no paid provider is
# involved.
#
# One phrase per file is the whole point: the scene's narration is assembled by
# concatenating these, so a phrase boundary is the cumulative sample count of
# the phrases before it — an exact measurement, not an estimate.

param(
  [Parameter(Mandatory = $true)][string]$JobPath,
  [Parameter(Mandatory = $true)][string]$Voice,
  [Parameter(Mandatory = $true)][int]$Rate
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$job = Get-Content -Raw -Path $JobPath | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice($Voice)
$synth.Rate = $Rate
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)

foreach ($phrase in $job) {
  $synth.SetOutputToWaveFile($phrase.outPath, $format)
  $synth.Speak($phrase.text)
  $synth.SetOutputToNull()
}

$synth.Dispose()
Write-Output "ok"
