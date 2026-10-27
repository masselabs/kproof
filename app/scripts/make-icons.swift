// Renders the KProof app icon from the brand kit master into every size the
// iOS and Android projects need, plus the iOS launch screen logo.
//
//   swift scripts/make-icons.swift            (run from app/)
//
// Source: assets/brand/app-icon.svg, the brand kit v1.0 master
// (masselabs/kproof-website brand/assets/app-icon.svg, commit d6eb2c1). The
// brand kit says: do not redraw, re-space or recolor the mark, and let the
// platform apply its own icon mask -- so the square master is drawn as is and
// only scaled.
//
// No SVG library is installed on this Mac and none is needed: the master uses
// one <rect> and absolute M/H/V/L/Z paths inside one translate+scale group.
// This parser accepts exactly that subset and stops with an error on anything
// else, so a changed master fails loudly instead of rendering wrong.
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct Shape { let fill: CGColor; let path: CGPath }

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(("make-icons: " + message + "\n").data(using: .utf8)!)
    exit(1)
}

func color(_ hex: String) -> CGColor {
    guard hex.count == 7, hex.hasPrefix("#"), let v = UInt32(hex.dropFirst(), radix: 16) else { fail("unsupported color '\(hex)'") }
    return CGColor(srgbRed: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255, blue: CGFloat(v & 0xff) / 255, alpha: 1)
}

func attr(_ tag: String, _ name: String) -> String? {
    guard let r = tag.range(of: " \(name)=\"") else { return nil }
    let rest = tag[r.upperBound...]
    guard let end = rest.firstIndex(of: "\"") else { return nil }
    return String(rest[..<end])
}

func parsePath(_ d: String, _ transform: CGAffineTransform) -> CGPath {
    let path = CGMutablePath()
    var tokens: [String] = []
    var current = ""
    for ch in d {
        if "MHVLZ".contains(ch) { if !current.isEmpty { tokens.append(current) }; tokens.append(String(ch)); current = "" }
        else if ch == " " || ch == "," { if !current.isEmpty { tokens.append(current) }; current = "" }
        else if "0123456789.-".contains(ch) { current.append(ch) }
        else { fail("unsupported path character '\(ch)'") }
    }
    if !current.isEmpty { tokens.append(current) }
    var i = 0
    var point = CGPoint.zero
    func number() -> CGFloat { guard i < tokens.count, let v = Double(tokens[i]) else { fail("bad number in path") }; i += 1; return CGFloat(v) }
    var command = ""
    while i < tokens.count {
        if "MHVLZ".contains(tokens[i]) { command = tokens[i]; i += 1 }
        switch command {
        case "M": point = CGPoint(x: number(), y: number()); path.move(to: point, transform: transform); command = "L"
        case "L": point = CGPoint(x: number(), y: number()); path.addLine(to: point, transform: transform)
        case "H": point.x = number(); path.addLine(to: point, transform: transform)
        case "V": point.y = number(); path.addLine(to: point, transform: transform)
        case "Z": path.closeSubpath()
        default: fail("unsupported path command '\(command)'")
        }
    }
    return path
}

func load(_ file: String) -> (CGFloat, [Shape]) {
    guard let svg = try? String(contentsOfFile: file, encoding: .utf8) else { fail("cannot read \(file)") }
    guard let vb = attr(svg, "viewBox")?.split(separator: " ").compactMap({ Double($0) }), vb.count == 4, vb[2] == vb[3] else { fail("viewBox must be square") }
    var shapes: [Shape] = []
    var transform = CGAffineTransform.identity
    var groupFill = "#000000"
    for raw in svg.components(separatedBy: "<").dropFirst() {
        let tag = " " + raw
        if raw.hasPrefix("rect") {
            guard let fill = attr(tag, "fill"), let w = attr(tag, "width"), let h = attr(tag, "height"), let wv = Double(w), let hv = Double(h) else { fail("rect needs fill, width, height") }
            shapes.append(Shape(fill: color(fill), path: CGPath(rect: CGRect(x: 0, y: 0, width: wv, height: hv), transform: nil)))
        } else if raw.hasPrefix("g") {
            groupFill = attr(tag, "fill") ?? groupFill
            if let t = attr(tag, "transform") {
                let nums = t.replacingOccurrences(of: "translate(", with: "").replacingOccurrences(of: ") scale(", with: " ").replacingOccurrences(of: ")", with: "").split(separator: " ").compactMap { Double($0) }
                guard nums.count == 3, t.hasPrefix("translate("), t.contains("scale(") else { fail("only 'translate(x y) scale(s)' is supported, got '\(t)'") }
                transform = CGAffineTransform(translationX: nums[0], y: nums[1]).scaledBy(x: nums[2], y: nums[2])
            }
        } else if raw.hasPrefix("path") {
            guard let d = attr(tag, "d") else { fail("path without d") }
            shapes.append(Shape(fill: color(attr(tag, "fill") ?? groupFill), path: parsePath(d, transform)))
        } else if raw.hasPrefix("/") || raw.hasPrefix("svg") {
            continue
        } else {
            fail("unsupported element '<\(raw.prefix(12))'")
        }
    }
    return (CGFloat(vb[2]), shapes)
}

func render(_ size: Int, _ viewBox: CGFloat, _ shapes: [Shape], round: Bool, to file: String) {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    guard let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { fail("no context") }
    ctx.setShouldAntialias(true)
    if round { ctx.addEllipse(in: CGRect(x: 0, y: 0, width: size, height: size)); ctx.clip() }
    // SVG's y axis points down; CoreGraphics' points up.
    ctx.translateBy(x: 0, y: CGFloat(size))
    ctx.scaleBy(x: CGFloat(size) / viewBox, y: -CGFloat(size) / viewBox)
    for s in shapes { ctx.setFillColor(s.fill); ctx.addPath(s.path); ctx.fillPath() }
    guard let image = ctx.makeImage() else { fail("render failed") }
    let url = URL(fileURLWithPath: file)
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else { fail("cannot write \(file)") }
    // iOS rejects an app icon with an alpha channel; the square icons are opaque.
    let options: [CFString: Any] = round ? [:] : [kCGImagePropertyHasAlpha: false]
    CGImageDestinationAddImage(dest, image, options as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { fail("cannot finalize \(file)") }
}

let (viewBox, shapes) = load("assets/brand/app-icon.svg")

// iOS: every entry of AppIcon.appiconset/Contents.json gets a file and a filename.
let iconset = "ios/KProof/Images.xcassets/AppIcon.appiconset"
guard let data = FileManager.default.contents(atPath: "\(iconset)/Contents.json"),
      var json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      var images = json["images"] as? [[String: Any]] else { fail("cannot read \(iconset)/Contents.json") }
for idx in images.indices {
    guard let sizeStr = images[idx]["size"] as? String, let scaleStr = images[idx]["scale"] as? String,
          let points = Double(sizeStr.split(separator: "x")[0]), let scale = Double(scaleStr.dropLast()) else { fail("bad iconset entry") }
    let px = Int(points * scale)
    let name = "icon-\(px).png"
    render(px, viewBox, shapes, round: false, to: "\(iconset)/\(name)")
    images[idx]["filename"] = name
}
json["images"] = images
let out = try! JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted, .sortedKeys])
try! out.write(to: URL(fileURLWithPath: "\(iconset)/Contents.json"))

// Android legacy launcher icons (square and round), the densities the template ships.
let densities: [(String, Int)] = [("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)]
for (density, px) in densities {
    render(px, viewBox, shapes, round: false, to: "android/app/src/main/res/mipmap-\(density)/ic_launcher.png")
    render(px, viewBox, shapes, round: true, to: "android/app/src/main/res/mipmap-\(density)/ic_launcher_round.png")
}
// iOS launch screen logo: the same square art at 112 pt, on the same #09090B
// background the storyboard paints, so the edge of the image is invisible.
let launchSet = "ios/KProof/Images.xcassets/LaunchLogo.imageset"
var launchImages: [[String: Any]] = []
for scale in [1, 2, 3] {
    let name = "launch-logo@\(scale)x.png"
    render(112 * scale, viewBox, shapes, round: false, to: "\(launchSet)/\(name)")
    launchImages.append(["idiom": "universal", "scale": "\(scale)x", "filename": name])
}
let launchJson = try! JSONSerialization.data(withJSONObject: ["images": launchImages, "info": ["author": "xcode", "version": 1]], options: [.prettyPrinted, .sortedKeys])
try! launchJson.write(to: URL(fileURLWithPath: "\(launchSet)/Contents.json"))

print("icons written: \(images.count) iOS, \(densities.count * 2) Android, 3 launch logo")
