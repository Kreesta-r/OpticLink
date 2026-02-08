use windows::{
    core::*,
    Win32::Media::MediaFoundation::*,
    Win32::System::Com::*,
    Win32::Foundation::*,
};

use windows_implement::implement;

#[implement(IMFMediaSource, IMFMediaEventGenerator, IMFAttributes)]
pub struct OpticLinkMediaSource {
    // Shared state will go here
}

impl OpticLinkMediaSource {
    pub fn new() -> Self {
        Self {}
    }
}

impl IMFMediaSource_Impl for OpticLinkMediaSource {
    fn GetCharacteristics(&self) -> Result<u32> {
        Ok(MFMEDIASOURCE_IS_LIVE)
    }

    fn CreatePresentationDescriptor(&self) -> Result<IMFPresentationDescriptor> {
        // Todo: Return a descriptor for 720p/1080p video
        Err(Error::from(E_NOTIMPL))
    }

    fn Start(&self, _pguidtimeformat: *const GUID, _pvarstartposition: *const PROPVARIANT) -> Result<()> {
        Ok(())
    }

    fn Stop(&self) -> Result<()> {
        Ok(())
    }

    fn Pause(&self) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn Shutdown(&self) -> Result<()> {
        Ok(())
    }
}

impl IMFMediaEventGenerator_Impl for OpticLinkMediaSource {
    fn GetEvent(&self, _dwflags: u32, _ppevent: *mut Option<IMFMediaEvent>) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn BeginGetEvent(&self, _pcallback: Ref<IMFAsyncCallback>, _punkstate: Ref<IUnknown>) -> Result<()> {
         Err(Error::from(E_NOTIMPL))
    }

    fn EndGetEvent(&self, _presult: Ref<IMFAsyncResult>, _ppevent: *mut Option<IMFMediaEvent>) -> Result<()> {
         Err(Error::from(E_NOTIMPL))
    }

    fn QueueEvent(&self, _met: u32, _guidetendedtype: *const GUID, _hrstatus: HRESULT, _pvalue: *const PROPVARIANT) -> Result<()> {
         Err(Error::from(E_NOTIMPL))
    }
}

impl IMFAttributes_Impl for OpticLinkMediaSource {
    fn GetItem(&self, _guidkey: *const GUID, _pvalue: *mut PROPVARIANT) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn GetItemType(&self, _guidkey: *const GUID, _ptype: *mut u32) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn CompareItem(&self, _guidkey: *const GUID, _value: *const PROPVARIANT, _pbres: *mut BOOL) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn Compare(&self, _ptheattributes: Ref<IMFAttributes>, _type: u32, _pbres: *mut BOOL) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn GetUINT32(&self, _guidkey: *const GUID, _punvalue: *mut u32) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn GetUINT64(&self, _guidkey: *const GUID, _punvalue: *mut u64) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn GetDouble(&self, _guidkey: *const GUID, _pfvalue: *mut f64) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn GetGUID(&self, _guidkey: *const GUID, _pguidvalue: *mut GUID) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn GetStringLength(&self, _guidkey: *const GUID, _pcchlength: *mut u32) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn GetString(&self, _guidkey: *const GUID, _pwszvalue: PWSTR, _cchbufsize: u32, _pcchlength: *mut u32) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn GetAllocatedString(&self, _guidkey: *const GUID, _ppwszvalue: *mut PWSTR, _pcchlength: *mut u32) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn GetBlobSize(&self, _guidkey: *const GUID, _pcbblobsize: *mut u32) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn GetBlob(&self, _guidkey: *const GUID, _pbuf: *mut u8, _cbbufsize: u32, _pcbblobsize: *mut u32) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn GetAllocatedBlob(&self, _guidkey: *const GUID, _ppbuf: *mut *mut u8, _pcbsize: *mut u32) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn GetUnknown(&self, _guidkey: *const GUID, _riid: *const GUID, _ppv: *mut *mut core::ffi::c_void) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn SetItem(&self, _guidkey: *const GUID, _value: *const PROPVARIANT) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn DeleteItem(&self, _guidkey: *const GUID) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn DeleteAllItems(&self) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn SetUINT32(&self, _guidkey: *const GUID, _unvalue: u32) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn SetUINT64(&self, _guidkey: *const GUID, _unvalue: u64) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn SetDouble(&self, _guidkey: *const GUID, _fvalue: f64) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn SetGUID(&self, _guidkey: *const GUID, _guidvalue: *const GUID) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn SetString(&self, _guidkey: *const GUID, _wszvalue: PCWSTR) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn SetBlob(&self, _guidkey: *const GUID, _pbuf: *const u8, _cb: u32) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn SetUnknown(&self, _guidkey: *const GUID, _punknown: Ref<IUnknown>) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn LockStore(&self) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn UnlockStore(&self) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn GetCount(&self, _pcitems: *mut u32) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn GetItemByIndex(&self, _unindex: u32, _pguidkey: *mut GUID, _pvalue: *mut PROPVARIANT) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }

    fn CopyAllItems(&self, _pdest: Ref<IMFAttributes>) -> Result<()> {
        Err(Error::from(E_NOTIMPL))
    }
}
