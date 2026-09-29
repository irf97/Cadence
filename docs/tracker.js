let detector, bodyMode=false;
onmessage=async({data})=>{
 try{
  if(data.type==='init'){
   self.exports={};
   importScripts('./vendor/vision_bundle.js');
   const vision=self.exports;
   const files=await vision.FilesetResolver.forVisionTasks(new URL('./vendor/wasm',self.location.href).href);
   bodyMode=data.mode==='body';
   detector=bodyMode
    ?await vision.PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./vendor/pose_landmarker_lite.task',self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.55,minPosePresenceConfidence:.55,minTrackingConfidence:.55,outputSegmentationMasks:false})
    :await vision.HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./vendor/hand_landmarker.task',self.location.href).href,delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5});
   postMessage({type:'ready'});
  }else if(data.type==='frame'){
   try{const result=detector.detectForVideo(data.bitmap,data.timestamp);postMessage({type:'result',result:bodyMode?{poseLandmarks:result.landmarks[0]??null}:result,timestamp:data.timestamp});}finally{data.bitmap.close();}
  }
 }catch(error){postMessage({type:'error',message:error.message||String(error)});}
};
