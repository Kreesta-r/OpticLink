use windows::core::*;
use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::System::Com::*;
use windows::Win32::System::Com::StructuredStorage::*; // For PROPVARIANT
use windows::Win32::Foundation::*;
// use std::sync::{Arc, Mutex}; // Not used directly here anymore

use crate::media_stream::{OpticLinkMediaStream, OpticLinkFrameSink};

use windows::core::implement;

#[implement(IMFMediaSource, IMFMediaEventGenerator, IMFAttributes)]
pub struct OpticLinkMediaSource {
    event_queue: IMFMediaEventQueue,
    stream: Option<OpticLinkMediaStream>,
    attributes: IMFAttributes,
}

impl OpticLinkMediaSource {
    pub fn new() -> Result<(Self, OpticLinkFrameSink)> {
        let event_queue = unsafe { MFCreateEventQueue()? };
        
        let mut attributes = None;
        unsafe { MFCreateAttributes(&mut attributes, 0)? };
        let attributes = attributes.ok_or(Error::from(E_FAIL))?;
        
        // Create Stream
        let (stream, sink) = OpticLinkMediaStream::new()?; // Returns Rust struct and Sink
        
        Ok((Self {
            event_queue,
            stream: Some(stream),
            attributes,
        }, sink))
    }
    
    pub fn get_stream(&self) -> Option<&OpticLinkMediaStream> {
        self.stream.as_ref()
    }
    
    fn create_stream_descriptor(&self) -> Result<IMFStreamDescriptor> {
        unsafe {
            let media_type = MFCreateMediaType()?;
            
            media_type.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
            // Use H.264 format
            media_type.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_H264)?;
            
            // MFSetAttributeSize(..., width, height) -> (width << 32) | height
            media_type.SetUINT64(&MF_MT_FRAME_SIZE, (1920u64 << 32) | 1080u64)?;
            media_type.SetUINT64(&MF_MT_FRAME_RATE, (30u64 << 32) | 1u64)?;
            media_type.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, (1u64 << 32) | 1u64)?;
            media_type.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)?;
            media_type.SetUINT32(&MF_MT_ALL_SAMPLES_INDEPENDENT, 1)?;
            
             // Create Stream Descriptor with 1 media type
            let media_types = [Some(media_type)];
            let sd = MFCreateStreamDescriptor(0, &media_types)?;
            Ok(sd)
        }
    }
}

pub fn register_virtual_camera(source: &OpticLinkMediaSource) -> Result<IMFVirtualCamera> {
    unsafe {
        // Create attributes for camera creation
        let mut attributes: Option<IMFAttributes> = None;
        MFCreateAttributes(&mut attributes, 0)?;
        let attributes = attributes.unwrap();
        
        let source_interface: IMFMediaSource = source.cast()?;
        
        // Use MFVirtualCameraType_SoftwareCameraSource
        // windows 0.48.0 binding might only take 6 arguments
        let cam = MFCreateVirtualCamera(
            MFVirtualCameraType_SoftwareCameraSource,
            MFVirtualCameraLifetime_Session, 
            MFVirtualCameraAccess_CurrentUser,
            &HSTRING::from("OpticLink Virtual Camera"),
            &HSTRING::from("{5C3C8F96-2679-450F-876D-292150186100}"), 
            None, 
            // &attributes, // Removed
            // &source_interface // Removed
        )?;
        
        // Pass the source interface when starting execution?
        // Or using AddProperty?
        // Let's try passing it to Start.
        cam.Start(Some(&source_interface.cast()?))?;
        Ok(cam)
    }
}


impl IMFMediaSource_Impl for OpticLinkMediaSource {
    fn GetCharacteristics(&self) -> Result<u32> {
        Ok(MFMEDIASOURCE_IS_LIVE.0 as u32)
    }

    fn CreatePresentationDescriptor(&self) -> Result<IMFPresentationDescriptor> {
        // Create SD
        let sd = self.create_stream_descriptor()?;
        
        // Create PD
        unsafe {
            let sds = [Some(sd.clone())];
            let pd = MFCreatePresentationDescriptor(Some(&sds))?;
            
            pd.SelectStream(0)?;
            Ok(pd)
        }
    }

    fn Start(&self, _ppresentationdescriptor: Option<&IMFPresentationDescriptor>, _pguidtimeformat: *const GUID, _pvarstartposition: *const PROPVARIANT) -> Result<()> {
        // Queue MESourceStarted
        unsafe {
            self.event_queue.QueueEventParamVar(
                MESourceStarted.0 as u32, 
                &GUID::zeroed(), 
                S_OK, 
                std::ptr::null()
            )?;
        }
        
        // Start Stream
        if let Some(stream) = &self.stream {
            stream.queue_started()?;
        }
        
        Ok(())
    }

    fn Stop(&self) -> Result<()> {
        unsafe {
            self.event_queue.QueueEventParamVar(
                MESourceStopped.0 as u32, 
                &GUID::zeroed(), 
                S_OK, 
                std::ptr::null()
            )?;
        }
        Ok(())
    }

    fn Pause(&self) -> Result<()> {
        unsafe {
            self.event_queue.QueueEventParamVar(
                MESourcePaused.0 as u32, 
                &GUID::zeroed(), 
                S_OK, 
                std::ptr::null()
            )?;
        }
        Ok(())
    }

    fn Shutdown(&self) -> Result<()> {
        if let Some(stream) = &self.stream {
            stream.shutdown()?;
        }
        unsafe {
            self.event_queue.Shutdown()?;
        }
        Ok(())
    }
}

impl IMFMediaEventGenerator_Impl for OpticLinkMediaSource {
    fn GetEvent(&self, dwflags: MEDIA_EVENT_GENERATOR_GET_EVENT_FLAGS) -> Result<IMFMediaEvent> {
        unsafe { self.event_queue.GetEvent(dwflags.0 as u32) }
    }

    fn BeginGetEvent(&self, pcallback: Option<&IMFAsyncCallback>, punkstate: Option<&IUnknown>) -> Result<()> {
        unsafe { self.event_queue.BeginGetEvent(pcallback, punkstate) }
    }

    fn EndGetEvent(&self, presult: Option<&IMFAsyncResult>) -> Result<IMFMediaEvent> {
        unsafe { self.event_queue.EndGetEvent(presult) }
    }

    fn QueueEvent(&self, met: u32, guidextendedtype: *const GUID, hrstatus: HRESULT, pvalue: *const PROPVARIANT) -> Result<()> {
        unsafe { self.event_queue.QueueEventParamVar(met, guidextendedtype, hrstatus, pvalue) }
    }
}

// Implement IMFAttributes by delegating (required for some MF functions)
impl IMFAttributes_Impl for OpticLinkMediaSource {
    fn GetItem(&self, guidkey: *const GUID, pvalue: *mut PROPVARIANT) -> Result<()> {
        unsafe { self.attributes.GetItem(guidkey, Some(pvalue)) }
    }

    fn GetItemType(&self, guidkey: *const GUID) -> Result<MF_ATTRIBUTE_TYPE> {
         unsafe { self.attributes.GetItemType(guidkey) }
    }

    fn CompareItem(&self, guidkey: *const GUID, value: *const PROPVARIANT) -> Result<BOOL> {
        unsafe { self.attributes.CompareItem(guidkey, value) }
    }

    fn Compare(&self, ptheattributes: Option<&IMFAttributes>, type_: MF_ATTRIBUTES_MATCH_TYPE) -> Result<BOOL> {
        unsafe { self.attributes.Compare(ptheattributes, type_) }
    }

    fn GetUINT32(&self, guidkey: *const GUID) -> Result<u32> {
        unsafe { self.attributes.GetUINT32(guidkey) }
    }

    fn GetUINT64(&self, guidkey: *const GUID) -> Result<u64> {
        unsafe { self.attributes.GetUINT64(guidkey) }
    }

    fn GetDouble(&self, guidkey: *const GUID) -> Result<f64> {
        unsafe { self.attributes.GetDouble(guidkey) }
    }

    fn GetGUID(&self, guidkey: *const GUID) -> Result<GUID> {
        unsafe { self.attributes.GetGUID(guidkey) }
    }

    fn GetStringLength(&self, guidkey: *const GUID) -> Result<u32> {
        unsafe { self.attributes.GetStringLength(guidkey) }
    }

    fn GetString(&self, guidkey: *const GUID, pwszvalue: PWSTR, cchbufsize: u32, pcchlength: *mut u32) -> Result<()> {
        unsafe { 
            let slice = std::slice::from_raw_parts_mut(pwszvalue.0, cchbufsize as usize);
            self.attributes.GetString(guidkey, slice, Some(pcchlength)) 
        }
    }

    fn GetAllocatedString(&self, guidkey: *const GUID, ppwszvalue: *mut PWSTR, pcchlength: *mut u32) -> Result<()> {
        unsafe { self.attributes.GetAllocatedString(guidkey, ppwszvalue, pcchlength) }
    }

    fn GetBlobSize(&self, guidkey: *const GUID) -> Result<u32> {
        unsafe { self.attributes.GetBlobSize(guidkey) }
    }

    fn GetBlob(&self, guidkey: *const GUID, pbuf: *mut u8, cbbufsize: u32, pcbblobsize: *mut u32) -> Result<()> {
        unsafe { 
            let slice = std::slice::from_raw_parts_mut(pbuf, cbbufsize as usize);
            self.attributes.GetBlob(guidkey, slice, Some(pcbblobsize)) 
        }
    }

    fn GetAllocatedBlob(&self, guidkey: *const GUID, ppbuf: *mut *mut u8, pcbcontext: *mut u32) -> Result<()> {
        unsafe { self.attributes.GetAllocatedBlob(guidkey, ppbuf, pcbcontext) }
    }

    fn GetUnknown(&self, guidkey: *const GUID, riid: *const GUID, ppv: *mut *mut std::ffi::c_void) -> Result<()> {
        unsafe {
             let unk: IUnknown = self.attributes.GetUnknown(guidkey)?;
             unk.query(&*riid, ppv as *mut _).ok()
        }
    }

    fn SetItem(&self, guidkey: *const GUID, value: *const PROPVARIANT) -> Result<()> {
        unsafe { self.attributes.SetItem(guidkey, value) }
    }

    fn DeleteItem(&self, guidkey: *const GUID) -> Result<()> {
        unsafe { self.attributes.DeleteItem(guidkey) }
    }

    fn DeleteAllItems(&self) -> Result<()> {
        unsafe { self.attributes.DeleteAllItems() }
    }

    fn SetUINT32(&self, guidkey: *const GUID, unvalue: u32) -> Result<()> {
        unsafe { self.attributes.SetUINT32(guidkey, unvalue) }
    }

    fn SetUINT64(&self, guidkey: *const GUID, unvalue: u64) -> Result<()> {
        unsafe { self.attributes.SetUINT64(guidkey, unvalue) }
    }

    fn SetDouble(&self, guidkey: *const GUID, fvalue: f64) -> Result<()> {
        unsafe { self.attributes.SetDouble(guidkey, fvalue) }
    }

    fn SetGUID(&self, guidkey: *const GUID, guidvalue: *const GUID) -> Result<()> {
        unsafe { self.attributes.SetGUID(guidkey, guidvalue) }
    }

    fn SetString(&self, guidkey: *const GUID, wszvalue: &windows::core::PCWSTR) -> Result<()> {
        unsafe { self.attributes.SetString(guidkey, *wszvalue) }
    }

    fn SetBlob(&self, guidkey: *const GUID, pbuf: *const u8, cbbufsize: u32) -> Result<()> {
        unsafe { 
            let slice = std::slice::from_raw_parts(pbuf, cbbufsize as usize);
            self.attributes.SetBlob(guidkey, slice) 
        }
    }

    fn SetUnknown(&self, guidkey: *const GUID, punk: Option<&IUnknown>) -> Result<()> {
        unsafe { self.attributes.SetUnknown(guidkey, punk) }
    }

    fn LockStore(&self) -> Result<()> {
        unsafe { self.attributes.LockStore() }
    }

    fn UnlockStore(&self) -> Result<()> {
        unsafe { self.attributes.UnlockStore() }
    }

    fn GetCount(&self) -> Result<u32> {
        unsafe { self.attributes.GetCount() }
    }

    fn GetItemByIndex(&self, unindex: u32, pguidkey: *mut GUID, pvalue: *mut PROPVARIANT) -> Result<()> {
        unsafe { self.attributes.GetItemByIndex(unindex, pguidkey, Some(pvalue)) }
    }

    fn CopyAllItems(&self, dest: Option<&IMFAttributes>) -> Result<()> {
        unsafe { self.attributes.CopyAllItems(dest) }
    }
}
