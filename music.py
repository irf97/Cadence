def midi_note(midi, hand='Left', zone='audition', name=None):
    midi = int(midi)
    pitch = ('C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B')[midi%12]+str(midi//12-1)
    return {'hand':hand,'zone':zone,'midi':midi,'frequency':440*2**((midi-69)/12),'name':pitch,'label':name or pitch}