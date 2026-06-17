import Foundation
import React
import UIKit

#if canImport(FamilyControls) && canImport(ManagedSettings)
import FamilyControls
import ManagedSettings
import SwiftUI
#endif

@objc(RiseFocusMode)
class RiseFocusModeModule: NSObject {
  #if canImport(FamilyControls) && canImport(ManagedSettings)
  private lazy var store: ManagedSettingsStore = {
    if #available(iOS 16.0, *) {
      return ManagedSettingsStore(named: .init("rise-focus-mode"))
    }
    return ManagedSettingsStore()
  }()
  private let userDefaults = UserDefaults.standard

  private func key(for protocolName: String) -> String {
    "rise.familyActivitySelection.\(protocolName)"
  }

  private func normalizedProtocol(_ protocolName: String) -> String {
    protocolName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  }

  private func loadSelection(for protocolName: String) -> FamilyActivitySelection? {
    let name = normalizedProtocol(protocolName)
    guard name == "lockin" || name == "flow" else { return nil }
    guard let data = userDefaults.data(forKey: key(for: name)) else { return nil }
    return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  private func saveSelection(_ selection: FamilyActivitySelection, for protocolName: String) throws {
    let name = normalizedProtocol(protocolName)
    guard name == "lockin" || name == "flow" else { return }
    let data = try JSONEncoder().encode(selection)
    userDefaults.set(data, forKey: key(for: name))
  }

  @available(iOS 16.0, *)
  private func clearShields() {
    store.clearAllSettings()
  }

  @available(iOS 16.0, *)
  private func applySelection(_ selection: FamilyActivitySelection) {
    store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
    store.shield.applicationCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
    store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
  }

  private func present(_ viewController: UIViewController) -> Bool {
    let root = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }?
      .rootViewController

    var top = root
    while let presented = top?.presentedViewController {
      top = presented
    }
    guard let presenter = top else { return false }
    presenter.present(viewController, animated: true)
    return true
  }
  #endif

  @objc
  static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc(requestAuthorization:rejecter:)
  func requestAuthorization(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(FamilyControls)
    if #available(iOS 16.0, *) {
      Task { @MainActor in
        do {
          try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
          resolve(true)
        } catch {
          reject("family_controls_authorization_failed", error.localizedDescription, error)
        }
      }
    } else {
      reject("family_controls_unavailable", "Family Controls individual authorization requires iOS 16 or later.", nil)
    }
    #else
    reject("family_controls_unavailable", "FamilyControls framework is unavailable in this build.", nil)
    #endif
  }

  @objc(isAuthorized:rejecter:)
  func isAuthorized(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    #if canImport(FamilyControls)
    if #available(iOS 16.0, *) {
      resolve(AuthorizationCenter.shared.authorizationStatus == .approved)
    } else {
      resolve(false)
    }
    #else
    resolve(false)
    #endif
  }

  @objc(presentPicker:resolver:rejecter:)
  func presentPicker(
    _ protocolName: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    #if canImport(FamilyControls) && canImport(ManagedSettings)
    if #available(iOS 16.0, *) {
      let name = normalizedProtocol(protocolName)
      guard name == "lockin" || name == "flow" else {
        resolve(false)
        return
      }

      DispatchQueue.main.async {
        let initialSelection = self.loadSelection(for: name) ?? FamilyActivitySelection()
        let picker = RiseFamilyActivityPickerView(
          protocolName: name,
          initialSelection: initialSelection,
          onSave: { selection in
            do {
              try self.saveSelection(selection, for: name)
              resolve(true)
            } catch {
              reject("family_controls_save_failed", error.localizedDescription, error)
            }
          },
          onCancel: {
            resolve(false)
          }
        )
        let controller = UIHostingController(rootView: picker)
        controller.modalPresentationStyle = .formSheet
        controller.isModalInPresentation = true
        if !self.present(controller) {
          reject("family_controls_present_failed", "Could not present the Screen Time picker.", nil)
        }
      }
    } else {
      reject("family_controls_unavailable", "Family Controls individual authorization requires iOS 16 or later.", nil)
    }
    #else
    reject("family_controls_unavailable", "FamilyControls framework is unavailable in this build.", nil)
    #endif
  }

  @objc(activate:resolver:rejecter:)
  func activate(
    _ protocolName: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    #if canImport(FamilyControls) && canImport(ManagedSettings)
    if #available(iOS 16.0, *) {
      let name = normalizedProtocol(protocolName)

      if name == "reset" {
        clearShields()
        resolve(true)
        return
      }

      guard name == "lockin" || name == "flow" else {
        resolve(false)
        return
      }

      guard AuthorizationCenter.shared.authorizationStatus == .approved else {
        resolve(false)
        return
      }

      guard let selection = loadSelection(for: name) else {
        resolve(false)
        return
      }

      applySelection(selection)
      resolve(true)
    } else {
      resolve(false)
    }
    #else
    resolve(false)
    #endif
  }

  @objc(deactivate:rejecter:)
  func deactivate(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    #if canImport(ManagedSettings)
    if #available(iOS 16.0, *) {
      clearShields()
    }
    #endif
    resolve(nil)
  }

  @objc(hasSelection:resolver:rejecter:)
  func hasSelection(
    _ protocolName: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    #if canImport(FamilyControls) && canImport(ManagedSettings)
    if #available(iOS 16.0, *) {
      let name = normalizedProtocol(protocolName)
      guard let selection = loadSelection(for: name) else {
        resolve(false)
        return
      }
      let hasSelection =
        !selection.applicationTokens.isEmpty ||
        !selection.categoryTokens.isEmpty ||
        !selection.webDomainTokens.isEmpty
      resolve(hasSelection)
    } else {
      resolve(false)
    }
    #else
    resolve(false)
    #endif
  }
}

#if canImport(FamilyControls)
@available(iOS 16.0, *)
private struct RiseFamilyActivityPickerView: View {
  let protocolName: String
  let onSave: (FamilyActivitySelection) -> Void
  let onCancel: () -> Void

  @Environment(\.dismiss) private var dismiss
  @State private var selection: FamilyActivitySelection

  init(
    protocolName: String,
    initialSelection: FamilyActivitySelection,
    onSave: @escaping (FamilyActivitySelection) -> Void,
    onCancel: @escaping () -> Void
  ) {
    self.protocolName = protocolName
    self.onSave = onSave
    self.onCancel = onCancel
    _selection = State(initialValue: initialSelection)
  }

  var body: some View {
    NavigationView {
      FamilyActivityPicker(selection: $selection)
        .navigationTitle(protocolName == "lockin" ? "LOCK IN blocking" : "FLOW blocking")
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Cancel") {
              dismiss()
              onCancel()
            }
          }
          ToolbarItem(placement: .confirmationAction) {
            Button("Save") {
              let savedSelection = selection
              dismiss()
              onSave(savedSelection)
            }
          }
        }
    }
  }
}
#endif
