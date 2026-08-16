package za.co.vink.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import za.co.vink.app.terminal.TelpoTerminalPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TelpoTerminalPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
