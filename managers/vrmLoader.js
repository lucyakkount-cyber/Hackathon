// managers/vrmLoader.js - Cleaned for Natural Animations Only

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
// Removed: import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { VRMLoaderPlugin } from '@pixiv/three-vrm'

export class VRMLoader {
  constructor() {
    this.loader = new GLTFLoader()
    // Removed: this.fbxLoader = new FBXLoader()
    this.loader.register((parser) => new VRMLoaderPlugin(parser))

    // Removed all animation cache and rig map properties
  }

  async loadVRMFromPath(path) {
    try {
      console.log('Loading VRM model from:', path)
      const gltf = await this.loader.loadAsync(path)
      const vrm = gltf.userData.vrm
      this.setupVRMModel(vrm)
      console.log('VRM model loaded successfully')
      return vrm
    } catch (error) {
      console.error('Failed to load VRM model:', error)
      throw error
    }
  }

  async loadVRMFromFile(file) {
    try {
      console.log('Loading VRM model from file:', file.name)
      const arrayBuffer = await file.arrayBuffer()
      const gltf = await this.loader.parseAsync(arrayBuffer, '', file.name)
      const vrm = gltf.userData.vrm
      this.setupVRMModel(vrm)
      console.log('VRM model loaded from file')
      return vrm
    } catch (error) {
      console.error('Failed to load VRM from file:', error)
      throw error
    }
  }

  setupVRMModel(vrm) {
    if (!vrm) return

    // Portrait mode positioning
    vrm.scene.rotation.y = Math.PI
    vrm.scene.scale.set(2.5, 2.5, 2.5)
    vrm.scene.position.set(0, -1.2, -0.3)
    vrm.scene.castShadow = true
    vrm.scene.receiveShadow = true

    // CRITICAL: Fix T-Pose immediately
    this.fixTPose(vrm)

    console.log('VRM model setup complete with T-pose fixed')
  }

  fixTPose(vrm) {
    if (!vrm || !vrm.humanoid) return

    try {
      // Get all arm bones
      const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm')
      const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm')
      const leftLowerArm = vrm.humanoid.getNormalizedBoneNode('leftLowerArm')
      const rightLowerArm = vrm.humanoid.getNormalizedBoneNode('rightLowerArm')
      const leftHand = vrm.humanoid.getNormalizedBoneNode('leftHand')
      const rightHand = vrm.humanoid.getNormalizedBoneNode('rightHand')
      const leftShoulder = vrm.humanoid.getNormalizedBoneNode('leftShoulder')
      const rightShoulder = vrm.humanoid.getNormalizedBoneNode('rightShoulder')

      // STRONG rotations to bring arms DOWN from T-pose
      if (leftUpperArm) {
        leftUpperArm.rotation.z = 1.0 // Bring left arm DOWN (stronger)
        leftUpperArm.rotation.x = 0.3 // Forward
        leftUpperArm.rotation.y = 0.2 // Inward
      }

      if (rightUpperArm) {
        rightUpperArm.rotation.z = -1.0 // Bring right arm DOWN (stronger)
        rightUpperArm.rotation.x = 0.3 // Forward
        rightUpperArm.rotation.y = -0.2 // Inward
      }

      // Bend elbows
      if (leftLowerArm) {
        leftLowerArm.rotation.y = -0.5
        leftLowerArm.rotation.x = 0.1
      }

      if (rightLowerArm) {
        rightLowerArm.rotation.y = 0.5
        rightLowerArm.rotation.x = 0.1
      }

      // Relax hands
      if (leftHand) {
        leftHand.rotation.z = 0.3
        leftHand.rotation.x = 0.2
      }

      if (rightHand) {
        rightHand.rotation.z = -0.3
        rightHand.rotation.x = 0.2
      }

      // Shoulders down
      if (leftShoulder) {
        leftShoulder.rotation.z = 0.1
        leftShoulder.rotation.y = 0.05
      }

      if (rightShoulder) {
        rightShoulder.rotation.z = -0.1
        rightShoulder.rotation.y = -0.05
      }

      console.log('T-pose fixed with strong rotations')
    } catch (error) {
      console.error('Error fixing T-pose:', error)
    }
  }

  // Removed: loadAnimationFromFBX
  // Removed: loadDefaultAnimations
  // Removed: convertMixamoClip

  cleanupVRM(vrm) {
    if (!vrm) return

    vrm.scene.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose())
        } else {
          child.material?.dispose()
        }
      }
    })

    // Removed: this.loadedClips cleanup logic
  }

  clearCache() {
    // Removed: this.animationCache.clear()
  }
}
