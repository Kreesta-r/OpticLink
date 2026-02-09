use windows::core::*;
use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::Foundation::*;
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use std::sync::{Arc, Mutex};
use std::collections::VecDeque;

use windows::core::implement;

struct SharedState {
    requests: VecDeque<()>, // Store tokens/requests. unique_token?
    frame_buffer: Option<Vec<u8>>,
}

#[implement(IMFMediaStream, IMFMediaEventGenerator)]
pub struct OpticLinkMediaStream {
    event_queue: IMFMediaEventQueue,
    state: Arc<Mutex<SharedState>>,
}

impl OpticLinkMediaStream {
    pub fn new() -> Result<Self> {
        let event_queue = unsafe { MFCreateEventQueue()? };
        
        Ok(Self {
            event_queue,
            state: Arc::new(Mutex::new(SharedState {
                requests: VecDeque::new(),
                frame_buffer: None,
            })),
        })
    }

    pub fn queue_started(&self) -> Result<()> {
        unsafe {
            self.event_queue.QueueEventParamVar(
                MEStreamStarted.0 as u32, 
                &GUID::zeroed(), 
                S_OK, 
                std::ptr::null()
            )?;
        }
        Ok(())
    }

    pub fn shutdown(&self) -> Result<()> {
        unsafe {
            self.event_queue.Shutdown()?;
        }
        Ok(())
    }

    // Called by WebRTC Client when a frame is available
    pub fn push_frame(&self, frame: Vec<u8>) -> Result<()> {
        let mut state = self.state.lock().unwrap();
        
        // Check if we have pending requests
        if let Some(_token) = state.requests.pop_front() {
             // Fulfill request
             drop(state); // Unlock before COM ops
             let sample = self.create_sample(&frame)?;

             unsafe {
                self.event_queue.QueueEventParamUnk(
                    MEMediaSample.0 as u32, 
                    &GUID::zeroed(), 
                    S_OK, 
                    Some(&sample.cast()?)
                )?;
             }
        } else {
            // Buffer frame
            state.frame_buffer = Some(frame);
        }
        Ok(())
    }

    fn create_sample(&self, frame: &[u8]) -> Result<IMFSample> {
        unsafe {
            let sample = MFCreateSample()?;
            
            let buffer = MFCreateMemoryBuffer(frame.len() as u32)?;
            
            let mut ptr = std::ptr::null_mut();
            let mut _len = 0; // max length
            let mut _current_len = 0;
            buffer.Lock(&mut ptr, Some(&mut _len), Some(&mut _current_len))?;
            
            std::ptr::copy_nonoverlapping(frame.as_ptr(), ptr, frame.len());
            
            buffer.Unlock()?;
            buffer.SetCurrentLength(frame.len() as u32)?;
            
            sample.AddBuffer(&buffer)?;
            
            // Set time/duration if known? For now just data.
            Ok(sample)
        }
    }
}

impl IMFMediaStream_Impl for OpticLinkMediaStream {
    fn GetMediaSource(&self) -> Result<IMFMediaSource> {
        // TODO: Return weak reference to parent source?
        Err(Error::from(E_NOTIMPL))
    }

    fn GetStreamDescriptor(&self) -> Result<IMFStreamDescriptor> {
        // TODO: Create and return descriptor
        Err(Error::from(E_NOTIMPL))
    }

    fn RequestSample(&self, _punktoken: Option<&IUnknown>) -> Result<()> {
        let mut state = self.state.lock().unwrap();
        
        if let Some(frame) = state.frame_buffer.take() {
            // Have frame, send it
            drop(state); // Unlock
            let sample = self.create_sample(&frame)?;
            unsafe {
                self.event_queue.QueueEventParamUnk(
                    MEMediaSample.0 as u32, 
                    &GUID::zeroed(), 
                    S_OK, 
                    Some(&sample.cast()?)
                )?;
            }
        } else {
            // No frame, queue request
            state.requests.push_back(());
        }
        Ok(())
    }
}

impl IMFMediaEventGenerator_Impl for OpticLinkMediaStream {
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
