// Draws the LCARS app icon (a combadge-style silver delta over a gold oval on a
// black LCARS tile) and writes a macOS .iconset folder.
// Usage: swift make_icon.swift <output.iconset>
// build.sh then converts it with: iconutil -c icns <output.iconset>

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let outDir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset")
try? FileManager.default.removeItem(at: outDir)
try! FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

let space = CGColorSpace(name: CGColorSpace.sRGB)!

func rgb(_ hex: UInt32, _ alpha: CGFloat = 1) -> CGColor {
    CGColor(colorSpace: space, components: [
        CGFloat((hex >> 16) & 0xFF) / 255, CGFloat((hex >> 8) & 0xFF) / 255, CGFloat(hex & 0xFF) / 255, alpha,
    ])!
}

func gradient(_ stops: [(CGFloat, UInt32)]) -> CGGradient {
    CGGradient(colorsSpace: space, colors: stops.map { rgb($0.1) } as CFArray, locations: stops.map { $0.0 })!
}

// Delta outline in a 1024 canvas (y down), symmetric about x = 512.
func deltaPath() -> CGPath {
    let p = CGMutablePath()
    p.move(to: CGPoint(x: 512, y: 170))
    p.addCurve(to: CGPoint(x: 735, y: 815), control1: CGPoint(x: 610, y: 300), control2: CGPoint(x: 715, y: 600))
    p.addCurve(to: CGPoint(x: 512, y: 625), control1: CGPoint(x: 660, y: 735), control2: CGPoint(x: 570, y: 640))
    p.addCurve(to: CGPoint(x: 289, y: 815), control1: CGPoint(x: 454, y: 640), control2: CGPoint(x: 364, y: 735))
    p.addCurve(to: CGPoint(x: 512, y: 170), control1: CGPoint(x: 309, y: 600), control2: CGPoint(x: 414, y: 300))
    p.closeSubpath()
    return p
}

func draw(_ ctx: CGContext) {
    // ── TILE ── (standard macOS icon grid: 824pt body inside 1024)
    let tileRect = CGRect(x: 100, y: 100, width: 824, height: 824)
    let tile = CGPath(roundedRect: tileRect, cornerWidth: 185, cornerHeight: 185, transform: nil)

    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: 14), blur: 28, color: rgb(0x000000, 0.45))
    ctx.addPath(tile)
    ctx.setFillColor(rgb(0x000000))
    ctx.fillPath()
    ctx.restoreGState()

    ctx.saveGState()
    ctx.addPath(tile)
    ctx.clip()
    ctx.drawLinearGradient(gradient([(0, 0x2B2B30), (1, 0x050506)]),
                           start: CGPoint(x: 512, y: 100), end: CGPoint(x: 512, y: 924), options: [])
    ctx.restoreGState()

    // LCARS orange rim
    ctx.saveGState()
    ctx.addPath(CGPath(roundedRect: tileRect.insetBy(dx: 9, dy: 9), cornerWidth: 177, cornerHeight: 177, transform: nil))
    ctx.setStrokeColor(rgb(0xFF9900, 0.9))
    ctx.setLineWidth(10)
    ctx.strokePath()
    ctx.restoreGState()

    // ── GOLD OVAL ──
    ctx.saveGState()
    ctx.translateBy(x: 512, y: 610)
    ctx.rotate(by: -6 * .pi / 180)
    let oval = CGRect(x: -310, y: -175, width: 620, height: 350)

    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: 10), blur: 20, color: rgb(0x000000, 0.6))
    ctx.addEllipse(in: oval)
    ctx.setFillColor(rgb(0xB8862B))
    ctx.fillPath()
    ctx.restoreGState()

    ctx.saveGState()
    ctx.addEllipse(in: oval)
    ctx.clip()
    ctx.drawLinearGradient(gradient([(0, 0xFCE38A), (0.45, 0xD9AA3C), (1, 0x7E5A1C)]),
                           start: CGPoint(x: 0, y: -175), end: CGPoint(x: 0, y: 175), options: [])
    ctx.restoreGState()

    ctx.addEllipse(in: oval.insetBy(dx: 26, dy: 26))
    ctx.setStrokeColor(rgb(0xFFF3C4, 0.45))
    ctx.setLineWidth(5)
    ctx.strokePath()

    ctx.addEllipse(in: oval)
    ctx.setStrokeColor(rgb(0x5E420E))
    ctx.setLineWidth(6)
    ctx.strokePath()
    ctx.restoreGState()

    // ── SILVER DELTA ── (leaning slightly right, like the badge)
    ctx.saveGState()
    ctx.translateBy(x: 512, y: 540)
    ctx.rotate(by: 9 * .pi / 180)
    ctx.translateBy(x: -512, y: -540)
    let delta = deltaPath()

    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 10, height: 16), blur: 20, color: rgb(0x000000, 0.55))
    ctx.addPath(delta)
    ctx.setFillColor(rgb(0xB9C0C8))
    ctx.fillPath()
    ctx.restoreGState()

    ctx.saveGState()
    ctx.addPath(delta)
    ctx.clip()
    ctx.drawLinearGradient(gradient([(0, 0x7F8892), (0.42, 0xF5F7F9), (0.52, 0xD3D8DE), (1, 0x6E7781)]),
                           start: CGPoint(x: 289, y: 0), end: CGPoint(x: 735, y: 0), options: [])
    ctx.restoreGState()

    ctx.addPath(delta)
    ctx.setStrokeColor(rgb(0x464C54))
    ctx.setLineWidth(5)
    ctx.setLineJoin(.round)
    ctx.strokePath()
    ctx.restoreGState()
}

// iconset entries: (file name, pixel size)
let entries: [(String, Int)] = [16, 32, 128, 256, 512].flatMap { pt in
    [("icon_\(pt)x\(pt).png", pt), ("icon_\(pt)x\(pt)@2x.png", pt * 2)]
}

for (name, px) in entries {
    let ctx = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: 0,
                        space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.interpolationQuality = .high
    // Flip to a y-down 1024 canvas.
    ctx.translateBy(x: 0, y: CGFloat(px))
    ctx.scaleBy(x: CGFloat(px) / 1024, y: -CGFloat(px) / 1024)
    draw(ctx)

    let url = outDir.appendingPathComponent(name)
    let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
    CGImageDestinationFinalize(dest)
}
print("Wrote \(entries.count) images to \(outDir.path)")
