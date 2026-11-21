// Prints the window number of the largest on-screen, layer-0 window owned by the named app, or nothing.
// Used by app-capture.sh: an Electron app is not scriptable, so AppleScript has no id `screencapture -l` takes.
import CoreGraphics
import Foundation

let owner = CommandLine.arguments.dropFirst().first ?? "Claude"
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
let best = list
  .filter { ($0[kCGWindowOwnerName as String] as? String) == owner && ($0[kCGWindowLayer as String] as? Int) == 0 }
  .max { area($0) < area($1) }
func area(_ w: [String: Any]) -> Double {
  let b = w[kCGWindowBounds as String] as? [String: Double] ?? [:]
  return (b["Width"] ?? 0) * (b["Height"] ?? 0)
}
if let n = best?[kCGWindowNumber as String] as? Int { print(n) }
