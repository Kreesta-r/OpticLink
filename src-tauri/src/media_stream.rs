use windows::core::*;
use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::Foundation::*;
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use std::sync::{Arc, Mutex};
use std::collections::VecDeque;

use windows::core::implement;

pub struct SharedState {
    requests: VecDeque<()>,
    frame_buffer: Option<Vec<u8>>,
}

#[derive(Clone)]
pub struct OpticLinkFrameSink {
    state: Arc<Mutex<SharedState>>,
    event_queue: IMFMediaEventQueue,
}

unsafe impl Send for OpticLinkFrameSink {}
unsafe impl Sync for OpticLinkFrameSink {}

impl OpticLinkFrameSink {
    pub fn push_frame(&self, frame: Vec<u8>) -> Result<()> {
        let mut state = self.state.lock().unwrap();

        if let Some(_token) = state.requests.pop_front() {
            drop(state);
            let sample = self.create_sample(&frame)?;
            unsafe {
                self.event_queue.QueueEventParamUnk(
                    MEMediaSample.0 as u32,
                    &GUID::zeroed(),
                    S_OK,
                    Some(&sample.cast()?),
                )?;
            }
        } else {
            state.frame_buffer = Some(frame);
        }
        Ok(())
    }

    fn create_sample(&self, frame: &[u8]) -> Result<IMFSample> {
        unsafe {
            let sample = MFCreateSample()?;
            let buffer = MFCreateMemoryBuffer(frame.len() as u32)?;

            let mut ptr = std::ptr::null_mut();
            let mut _len = 0;
            let mut _current_len = 0;
            buffer.Lock(&mut ptr, Some(&mut _len), Some(&mut _current_len))?;
            std::ptr::copy_nonoverlapping(frame.as_ptr(), ptr, frame.len());
            buffer.Unlock()?;
            buffer.SetCurrentLength(frame.len() as u32)?;

            sample.AddBuffer(&buffer)?;
            Ok(sample)
        }
    }
}

#[implement(IMFMediaStream, IMFMediaEventGenerator)]
pub struct OpticLinkMediaStream {
    event_queue: IMFMediaEventQueue,
    state: Arc<Mutex<SharedState>>,
}

fn create_h264_stream_descriptor() -> Result<IMFStreamDescriptor> {
    unsafe {
        let media_type = MFCreateMediaType()?;
        media_type.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video)?;
        media_type.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_H264)?;
        media_type.SetUINT64(&MF_MT_FRAME_SIZE, (1920u64 << 32) | 1080u64)?;
        media_type.SetUINT64(&MF_MT_FRAME_RATE, (30u64 << 32) | 1u64)?;
        media_type.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, (1u64 << 32) | 1u64)?;
        media_type.SetUINT32(&MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive.0 as u32)?;
        media_type.SetUINT32(&MF_MT_ALL_SAMPLES_INDEPENDENT, 1)?;
        let media_types = [Some(media_type)];
        MFCreateStreamDescriptor(0, &media_types)
    }
}

impl OpticLinkMediaStream {
    /// Returns (IMFMediaStream, stream_event_queue_clone, OpticLinkFrameSink).
    /// The event queue clone is kept by the source so it can fire MEStreamStarted/etc.
    pub fn new() -> Result<(IMFMediaStream, IMFMediaEventQueue, OpticLinkFrameSink)> {
        let event_queue = unsafe { MFCreateEventQueue()? };

        let state = Arc::new(Mutex::new(SharedState {
            requests: VecDeque::new(),
            frame_buffer: None,
        }));

        let sink = OpticLinkFrameSink {
            state: state.clone(),
            event_queue: event_queue.clone(),
        };

        // Clone queue before consuming Self into COM object
        let eq_clone = event_queue.clone();

        let stream = Self { event_queue, state };
        let unknown: IUnknown = stream.into(); // COM heap allocation
        let mf_stream: IMFMediaStream = unknown.cast()?;

        Ok((mf_stream, eq_clone, sink))
    }
}

impl IMFMediaStream_Impl for OpticLinkMediaStream {
    fn GetMediaSource(&self) -> Result<IMFMediaSource> {
        Err(Error::from(E_NOTIMPL))
    }

    fn GetStreamDescriptor(&self) -> Result<IMFStreamDescriptor> {
        create_h264_stream_descriptor()
    }

    fn RequestSample(&self, _punktoken: Option<&IUnknown>) -> Result<()> {
        let mut state = self.state.lock().unwrap();

        if let Some(frame) = state.frame_buffer.take() {
            drop(state);
            let sample = self.create_sample(&frame)?;
            unsafe {
                self.event_queue.QueueEventParamUnk(
                    MEMediaSample.0 as u32,
                    &GUID::zeroed(),
                    S_OK,
                    Some(&sample.cast()?),
                )?;
            }
        } else {
            state.requests.push_back(());
        }
        Ok(())
    }
}

impl IMFMediaEventGenerator_Impl for OpticLinkMediaStream {
    fn GetEvent(&self, dwflags: MEDIA_EVENT_GENERATOR_GET_EVENT_FLAGS) -> Result<IMFMediaEvent> {
        unsafe { self.event_queue.GetEvent(dwflags.0 as u32) }
    }

    fn BeginGetEvent(
        &self,
        pcallback: Option<&IMFAsyncCallback>,
        punkstate: Option<&IUnknown>,
    ) -> Result<()> {
        unsafe { self.event_queue.BeginGetEvent(pcallback, punkstate) }
    }

    fn EndGetEvent(
        &self,
        presult: Option<&IMFAsyncResult>,
    ) -> Result<IMFMediaEvent> {
        unsafe { self.event_queue.EndGetEvent(presult) }
    }

    fn QueueEvent(
        &self,
        met: u32,
        guidextendedtype: *const GUID,
        hrstatus: HRESULT,
        pvalue: *const PROPVARIANT,
    ) -> Result<()> {
        unsafe { self.event_queue.QueueEventParamVar(met, guidextendedtype, hrstatus, pvalue) }
    }
}

impl OpticLinkMediaStream {
    fn create_sample(&self, frame: &[u8]) -> Result<IMFSample> {
        unsafe {
            let sample = MFCreateSample()?;
            let buffer = MFCreateMemoryBuffer(frame.len() as u32)?;

            let mut ptr = std::ptr::null_mut();
            let mut _len = 0;
            let mut _current_len = 0;
            buffer.Lock(&mut ptr, Some(&mut _len), Some(&mut _current_len))?;
            std::ptr::copy_nonoverlapping(frame.as_ptr(), ptr, frame.len());
            buffer.Unlock()?;
            buffer.SetCurrentLength(frame.len() as u32)?;

            sample.AddBuffer(&buffer)?;
            Ok(sample)
        }
    }
}
