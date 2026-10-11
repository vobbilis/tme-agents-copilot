import Foundation
import Vision
import Darwin

struct Rectangle: Encodable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct Observation: Encodable {
    let text: String
    let confidence: Float
    let rect: Rectangle
}

struct Report: Encodable {
    let observations: [Observation]
}

guard CommandLine.arguments.count == 2 else {
    FileHandle.standardError.write(Data("FOOTAGE_OCR_ARGUMENT_INVALID\n".utf8))
    exit(2)
}

do {
    let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    let handler = VNImageRequestHandler(url: imageURL, options: [:])
    try handler.perform([request])
    let observations = (request.results ?? []).compactMap { observation -> Observation? in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        let bounds = observation.boundingBox
        return Observation(text: candidate.string, confidence: candidate.confidence,
                           rect: Rectangle(x: Double(bounds.origin.x), y: Double(bounds.origin.y),
                                           width: Double(bounds.width), height: Double(bounds.height)))
    }
    let output = try JSONEncoder().encode(Report(observations: observations))
    guard output.count <= 256 * 1024 else {
        FileHandle.standardError.write(Data("FOOTAGE_OCR_OUTPUT_TOO_LARGE\n".utf8))
        exit(2)
    }
    FileHandle.standardOutput.write(output)
    FileHandle.standardOutput.write(Data("\n".utf8))
} catch {
    FileHandle.standardError.write(Data("FOOTAGE_OCR_PROCESS_FAILED\n".utf8))
    exit(2)
}